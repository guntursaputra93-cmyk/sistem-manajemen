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
import { Card } from "@/components/ui/Card";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { DatePicker } from "@/components/ui/DatePicker";

const STATUS_LABEL: Record<string, string> = { open: "Berjalan", won: "Menang", lost: "Hilang" };
const STATUS_VARIANT: Record<string, BadgeVariant> = { open: "powder-blue", won: "sage", lost: "destructive" };

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

  const columns: DataTableColumn<(typeof oppList)[number]>[] = [
    {
      key: "title",
      header: "Judul",
      render: (opp) => (
        <a href={`/${companySlug}/crm/opportunities/${opp.id}`} className="font-medium text-sage-deep hover:underline">
          {opp.title}
        </a>
      ),
    },
    { key: "org", header: "Organisasi", render: (opp) => orgList.find((o) => o.id === opp.organizationId)?.name ?? "-" },
    { key: "stage", header: "Tahap", render: (opp) => stageList.find((s) => s.id === opp.currentStageId)?.stageKey ?? "-" },
    {
      key: "status",
      header: "Status",
      render: (opp) => <Badge variant={STATUS_VARIANT[opp.status] ?? "powder-blue"}>{STATUS_LABEL[opp.status] ?? opp.status}</Badge>,
    },
    { key: "assignee", header: "Ditugaskan", render: (opp) => userList.find((u) => u.id === opp.assignedTo)?.fullName ?? "-" },
  ];

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Opportunity / Pipeline (CRM)</h1>
        <p className="text-sm text-ink-muted mt-1">
          {session.user.role === "staff" ? "Opportunity milikmu." : session.user.role === "department_head" ? "Opportunity di departemenmu." : `Semua opportunity di ${company.name}.`}
        </p>
      </div>

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      {canCreate && (
        <Card title="Buat Opportunity">
          {orgList.length === 0 || stageList.length === 0 ? (
            <p className="text-sm text-ink-muted italic">
              Belum ada organisasi atau tahap pipeline. Buat dulu di{" "}
              <Link href={`/${companySlug}/crm/organisasi`} className="text-sage-deep hover:underline">
                CRM &rarr; Organisasi
              </Link>{" "}
              atau{" "}
              <Link href={`/${companySlug}/pengaturan/pipeline`} className="text-sage-deep hover:underline">
                Pengaturan &rarr; Pipeline
              </Link>
              .
            </p>
          ) : (
            <form action={createOpportunityAction} className="grid grid-cols-2 gap-4">
              <input type="hidden" name="companySlug" value={companySlug} />
              <input type="hidden" name="companyId" value={company.id} />
              <div className="col-span-2">
                <label className="block text-xs font-medium text-ink-muted mb-1">Judul Deal</label>
                <input
                  name="title"
                  required
                  className="w-full border border-ink-muted/20 rounded-lg px-3 py-2 text-sm text-ink bg-surface"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-muted mb-1">Organisasi</label>
                <select
                  name="organizationId"
                  required
                  className="w-full border border-ink-muted/20 rounded-lg px-3 py-2 text-sm text-ink bg-surface"
                >
                  {orgList.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-muted mb-1">Tahap Awal</label>
                <select
                  name="currentStageId"
                  required
                  className="w-full border border-ink-muted/20 rounded-lg px-3 py-2 text-sm text-ink bg-surface"
                >
                  {stageList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.stageKey}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-muted mb-1">Estimasi Nilai (Rp)</label>
                <input
                  name="estimatedValue"
                  type="number"
                  step="0.01"
                  className="w-full border border-ink-muted/20 rounded-lg px-3 py-2 text-sm text-ink bg-surface"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-muted mb-1">Target Tutup</label>
                <DatePicker name="expectedCloseDate" />
              </div>
              {!restrictAssignee && (
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-ink-muted mb-1">Ditugaskan ke</label>
                  <select
                    name="assignedTo"
                    className="w-full border border-ink-muted/20 rounded-lg px-3 py-2 text-sm text-ink bg-surface"
                    defaultValue={session.user.id}
                  >
                    {userList.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="col-span-2">
                <button type="submit" className="bg-powder-blue-deep hover:bg-powder-blue-deep/90 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
                  Buat Opportunity
                </button>
              </div>
            </form>
          )}
        </Card>
      )}

      <DataTable columns={columns} rows={oppList} rowKey={(opp) => opp.id} emptyMessage="Belum ada opportunity. Opportunity baru akan muncul di sini." />
    </div>
  );
}
