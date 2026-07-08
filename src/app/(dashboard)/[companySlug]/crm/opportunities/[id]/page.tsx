import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, organizations, opportunities, opportunityStageHistory, pipelineStages, users } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { changeStageAction, reassignOpportunityAction } from "../actions";
import { TrailStepper, type TrailStep, type TrailStepStatus } from "@/components/ui/TrailStepper";

const STATUS_LABEL: Record<string, string> = { open: "Berjalan", won: "Menang", lost: "Hilang" };

export default async function OpportunityDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ companySlug: string; id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { companySlug, id } = await params;
  const { error, success } = await searchParams;
  const session = await auth();
  if (!session?.user) return null;

  if (!hasPermission(session.user.role, "VIEW_OPPORTUNITIES")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) => tx.select().from(companies).where(eq(companies.slug, companySlug)));
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "crm", companySlug }));

  const [opp] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(opportunities).where(and(eq(opportunities.id, id), eq(opportunities.companyId, company.id)))
  );
  if (!opp) notFound();

  const [org, stageList, history, userList] = await Promise.all([
    withTenantContext(tenantContext, (tx) => tx.select().from(organizations).where(eq(organizations.id, opp.organizationId))).then((r) => r[0]),
    withTenantContext(tenantContext, (tx) => tx.select().from(pipelineStages).where(eq(pipelineStages.companyId, company.id)).orderBy(asc(pipelineStages.stageOrder))),
    withTenantContext(tenantContext, (tx) => tx.select().from(opportunityStageHistory).where(eq(opportunityStageHistory.opportunityId, opp.id)).orderBy(asc(opportunityStageHistory.enteredAt))),
    withTenantContext(tenantContext, (tx) => tx.select().from(users).where(eq(users.companyId, company.id)).orderBy(asc(users.fullName))),
  ]);

  const currentStage = stageList.find((s) => s.id === opp.currentStageId);
  const assignee = userList.find((u) => u.id === opp.assignedTo);
  const canAct = hasPermission(session.user.role, "CREATE_OPPORTUNITY");
  const canReassign = hasPermission(session.user.role, "REASSIGN_OPPORTUNITY");

  // Progress bar horizontal seluruh tahap pipeline (Bagian 3 spesifikasi desain)
  // — beda dari "Riwayat Tahap" di bawah yang isinya log kronologis per kejadian.
  const currentIndex = stageList.findIndex((s) => s.id === opp.currentStageId);
  const pipelineTrail: TrailStep[] = stageList.map((s, i) => {
    let status: TrailStepStatus;
    if (opp.status === "lost") {
      status = i < currentIndex ? "done" : i === currentIndex ? "rejected" : "upcoming";
    } else if (opp.status === "won") {
      status = i <= currentIndex ? "done" : "upcoming";
    } else {
      status = i < currentIndex ? "done" : i === currentIndex ? "pending" : "upcoming";
    }
    return { id: s.id, label: s.stageKey, status };
  });

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <Link href={`/${companySlug}/crm/opportunities`} className="text-sm text-blue-600 hover:underline">&larr; Kembali</Link>
        <h1 className="text-xl font-bold text-gray-900 mt-2">{opp.title}</h1>
        <p className="text-gray-500 text-sm mt-1">{org?.name}</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      {pipelineTrail.length > 0 && (
        <section className="bg-white border border-gray-100 rounded-xl p-6">
          <TrailStepper steps={pipelineTrail} orientation="horizontal" />
        </section>
      )}

      <section className="bg-white border border-gray-100 rounded-xl p-6 grid grid-cols-2 gap-3 text-sm">
        <div><span className="text-gray-500">Tahap Saat Ini</span><p className="text-gray-900">{currentStage?.stageKey}</p></div>
        <div><span className="text-gray-500">Status</span><p className="text-gray-900">{STATUS_LABEL[opp.status]}</p></div>
        <div><span className="text-gray-500">Estimasi Nilai</span><p className="text-gray-900">{opp.estimatedValue ? `Rp ${opp.estimatedValue}` : "-"}</p></div>
        <div><span className="text-gray-500">Target Tutup</span><p className="text-gray-900">{opp.expectedCloseDate ?? "-"}</p></div>
        <div><span className="text-gray-500">Ditugaskan ke</span><p className="text-gray-900">{assignee?.fullName ?? "-"}</p></div>
        {opp.lostReason && <div className="col-span-2"><span className="text-gray-500">Alasan Hilang</span><p className="text-gray-900">{opp.lostReason}</p></div>}
      </section>

      {canAct && (
        <section className="bg-white border border-gray-100 rounded-xl p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Pindah Tahap</h2>
          <form action={changeStageAction} className="grid grid-cols-2 gap-4">
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="companyId" value={company.id} />
            <input type="hidden" name="opportunityId" value={opp.id} />
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tahap Baru</label>
              <select name="newStageId" defaultValue={opp.currentStageId} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                {stageList.map((s) => <option key={s.id} value={s.id}>{s.stageKey}{s.isWonStage ? " (menang)" : s.isLostStage ? " (hilang)" : ""}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Alasan (kalau pindah ke tahap hilang)</label>
              <input name="lostReason" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">Pindahkan</button>
            </div>
          </form>
        </section>
      )}

      {canReassign && (
        <section className="bg-white border border-gray-100 rounded-xl p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Pindahkan Kepemilikan</h2>
          <form action={reassignOpportunityAction} className="flex items-center gap-3">
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="companyId" value={company.id} />
            <input type="hidden" name="opportunityId" value={opp.id} />
            <select name="newAssignedTo" defaultValue={opp.assignedTo} className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
              {userList.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
            </select>
            <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">Pindahkan</button>
          </form>
        </section>
      )}

      <section className="bg-white border border-gray-100 rounded-xl p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Riwayat Tahap</h2>
        <ol className="space-y-2 text-sm">
          {history.map((h) => {
            const stage = stageList.find((s) => s.id === h.stageId);
            return (
              <li key={h.id} className="border-l-2 border-blue-200 pl-3">
                <span className="font-medium">{stage?.stageKey}</span> — masuk {new Date(h.enteredAt).toLocaleString("id-ID")}
                {h.exitedAt ? `, keluar ${new Date(h.exitedAt).toLocaleString("id-ID")}` : " (saat ini)"}
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
