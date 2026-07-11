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
import { Card } from "@/components/ui/Card";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";

const STATUS_LABEL: Record<string, string> = { open: "Berjalan", won: "Menang", lost: "Hilang" };
const STATUS_VARIANT: Record<string, BadgeVariant> = { open: "powder-blue", won: "sage", lost: "destructive" };

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
    <div className="space-y-6">
      <div>
        <Link href={`/${companySlug}/crm/opportunities`} className="text-sm text-sage-deep hover:underline">
          &larr; Kembali
        </Link>
        <h1 className="font-display text-[17px] font-extrabold text-ink mt-2">{opp.title}</h1>
        <p className="text-sm text-ink-muted mt-1">{org?.name}</p>
      </div>

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      {pipelineTrail.length > 0 && (
        <Card>
          <TrailStepper steps={pipelineTrail} orientation="horizontal" />
        </Card>
      )}

      <Card>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-ink-muted">Tahap Saat Ini</dt>
            <dd className="text-ink">{currentStage?.stageKey}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Status</dt>
            <dd>
              <Badge variant={STATUS_VARIANT[opp.status] ?? "powder-blue"}>{STATUS_LABEL[opp.status]}</Badge>
            </dd>
          </div>
          <div>
            <dt className="text-ink-muted">Estimasi Nilai</dt>
            <dd className="text-ink">{opp.estimatedValue ? `Rp ${opp.estimatedValue}` : "-"}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Target Tutup</dt>
            <dd className="text-ink">{opp.expectedCloseDate ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Ditugaskan ke</dt>
            <dd className="text-ink">{assignee?.fullName ?? "-"}</dd>
          </div>
          {opp.lostReason && (
            <div className="col-span-2">
              <dt className="text-ink-muted">Alasan Hilang</dt>
              <dd className="text-ink">{opp.lostReason}</dd>
            </div>
          )}
        </dl>
      </Card>

      {canAct && (
        <Card title="Pindah Tahap">
          <form action={changeStageAction} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="companyId" value={company.id} />
            <input type="hidden" name="opportunityId" value={opp.id} />
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Tahap Baru</label>
              <select
                name="newStageId"
                defaultValue={opp.currentStageId}
                className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base"
              >
                {stageList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.stageKey}
                    {s.isWonStage ? " (menang)" : s.isLostStage ? " (hilang)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Alasan (kalau pindah ke tahap hilang)</label>
              <input autoComplete="off"
                name="lostReason"
                className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base"
              />
            </div>
            <div className="col-span-full">
              <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]">
                Pindahkan
              </button>
            </div>
          </form>
        </Card>
      )}

      {canReassign && (
        <Card title="Pindahkan Kepemilikan">
          <form action={reassignOpportunityAction} className="flex items-center gap-3">
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="companyId" value={company.id} />
            <input type="hidden" name="opportunityId" value={opp.id} />
            <select
              name="newAssignedTo"
              defaultValue={opp.assignedTo}
              className="border border-ink-muted/20 rounded-lg px-3 py-2 text-sm text-ink bg-surface"
            >
              {userList.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
            </select>
            <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]">
              Pindahkan
            </button>
          </form>
        </Card>
      )}

      <Card title="Riwayat Tahap">
        <ol className="space-y-2 text-sm">
          {history.map((h) => {
            const stage = stageList.find((s) => s.id === h.stageId);
            return (
              <li key={h.id} className="border-l-2 border-powder-blue pl-3">
                <span className="font-medium text-ink">{stage?.stageKey}</span>
                <span className="text-ink-muted">
                  {" "}
                  — masuk {new Date(h.enteredAt).toLocaleString("id-ID")}
                  {h.exitedAt ? `, keluar ${new Date(h.exitedAt).toLocaleString("id-ID")}` : " (saat ini)"}
                </span>
              </li>
            );
          })}
        </ol>
      </Card>
    </div>
  );
}
