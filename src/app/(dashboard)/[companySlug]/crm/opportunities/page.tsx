import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, organizations, opportunities, pipelineStages, users } from "@/drizzle/schema";
import { hasPermission, type Role } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { getVisibleAssigneeIds } from "@/lib/crm/opportunities";
import { createOpportunityAction } from "./actions";

const STATUS_LABEL: Record<string, string> = { open: "Berjalan", won: "Menang", lost: "Hilang" };

export default async function OpportunitiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ companySlug: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { companySlug } = await params;
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

  const [selfUser, orgList, stageList, userList] = await Promise.all([
    withTenantContext(tenantContext, (tx) => tx.select().from(users).where(eq(users.id, session.user.id))).then((r) => r[0]),
    withTenantContext(tenantContext, (tx) => tx.select().from(organizations).where(eq(organizations.companyId, company.id)).orderBy(asc(organizations.name))),
    withTenantContext(tenantContext, (tx) => tx.select().from(pipelineStages).where(eq(pipelineStages.companyId, company.id)).orderBy(asc(pipelineStages.stageOrder))),
    withTenantContext(tenantContext, (tx) => tx.select().from(users).where(eq(users.companyId, company.id)).orderBy(asc(users.fullName))),
  ]);

  const viewer = { userId: session.user.id, role: session.user.role as Role, departmentId: selfUser?.departmentId ?? null };
  const visibleAssigneeIds = await withTenantContext(tenantContext, (tx) => getVisibleAssigneeIds(tx, { companyId: company.id, viewer }));

  const oppList = await withTenantContext(tenantContext, (tx) =>
    tx
      .select()
      .from(opportunities)
      .where(
        visibleAssigneeIds
          ? and(eq(opportunities.companyId, company.id), inArray(opportunities.assignedTo, visibleAssigneeIds))
          : eq(opportunities.companyId, company.id)
      )
  ).then((rows) => rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));

  const canCreate = hasPermission(session.user.role, "CREATE_OPPORTUNITY");
  const restrictAssignee = session.user.role === "staff";

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Opportunity / Pipeline (CRM)</h1>
        <p className="text-gray-500 text-sm mt-1">
          {session.user.role === "staff" ? "Opportunity milikmu." : session.user.role === "department_head" ? "Opportunity di departemenmu." : `Semua opportunity di ${company.name}.`}
        </p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      {canCreate && (
        <section className="bg-white border border-gray-100 rounded-xl p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Buat Opportunity</h2>
          {orgList.length === 0 || stageList.length === 0 ? (
            <p className="text-sm text-gray-400 italic">
              Belum ada organisasi atau tahap pipeline. Buat dulu di{" "}
              <Link href={`/${companySlug}/crm/organisasi`} className="text-blue-600 hover:underline">CRM &rarr; Organisasi</Link>
              {" "}atau{" "}
              <Link href={`/${companySlug}/pengaturan/pipeline`} className="text-blue-600 hover:underline">Pengaturan &rarr; Pipeline</Link>.
            </p>
          ) : (
            <form action={createOpportunityAction} className="grid grid-cols-2 gap-4">
              <input type="hidden" name="companySlug" value={companySlug} />
              <input type="hidden" name="companyId" value={company.id} />
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Judul Deal</label>
                <input name="title" required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Organisasi</label>
                <select name="organizationId" required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  {orgList.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Tahap Awal</label>
                <select name="currentStageId" required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  {stageList.map((s) => <option key={s.id} value={s.id}>{s.stageKey}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Estimasi Nilai (Rp)</label>
                <input name="estimatedValue" type="number" step="0.01" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Target Tutup</label>
                <input name="expectedCloseDate" type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              {!restrictAssignee && (
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Ditugaskan ke</label>
                  <select name="assignedTo" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" defaultValue={session.user.id}>
                    {userList.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                  </select>
                </div>
              )}
              <div className="col-span-2">
                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
                  Buat Opportunity
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      <section className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Judul</th>
              <th className="text-left px-4 py-2">Organisasi</th>
              <th className="text-left px-4 py-2">Tahap</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-left px-4 py-2">Ditugaskan</th>
            </tr>
          </thead>
          <tbody>
            {oppList.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400 italic">Belum ada opportunity.</td></tr>
            )}
            {oppList.map((opp) => {
              const org = orgList.find((o) => o.id === opp.organizationId);
              const stage = stageList.find((s) => s.id === opp.currentStageId);
              const assignee = userList.find((u) => u.id === opp.assignedTo);
              return (
                <tr key={opp.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <Link href={`/${companySlug}/crm/opportunities/${opp.id}`} className="text-blue-600 hover:underline">{opp.title}</Link>
                  </td>
                  <td className="px-4 py-2">{org?.name ?? "-"}</td>
                  <td className="px-4 py-2">{stage?.stageKey ?? "-"}</td>
                  <td className="px-4 py-2">{STATUS_LABEL[opp.status] ?? opp.status}</td>
                  <td className="px-4 py-2">{assignee?.fullName ?? "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
