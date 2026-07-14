import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, organizations } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { getProjectMarginList } from "@/lib/finance/margin";
import { formatRupiah } from "@/lib/finance/format";
import { Card } from "@/components/ui/Card";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";

export default async function ProjectMarginPage({
  params,
}: {
  params: Promise<{ companySlug: string }>;
}) {
  const { companySlug } = await params;
  const session = await auth();
  if (!session?.user) return null;

  if (!hasPermission(session.user.role, "VIEW_HPP_PROJECT_COSTS")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "keuangan", companySlug }));

  const [marginRows, orgList] = await Promise.all([
    withTenantContext(tenantContext, (tx) => getProjectMarginList(tx, { companyId: company.id })),
    withTenantContext(tenantContext, (tx) => tx.select().from(organizations).where(eq(organizations.companyId, company.id))),
  ]);

  const orgNameByOrgId = new Map(orgList.map((o) => [o.id, o.name]));

  const columns: DataTableColumn<(typeof marginRows)[number]>[] = [
    { key: "client", header: "Klien", render: (r) => orgNameByOrgId.get(r.contract.organizationId) ?? "-" },
    { key: "contractValue", header: "Nilai Kontrak", render: (r) => formatRupiah(r.contract.contractValue), className: "text-right" },
    { key: "invoiced", header: "Total Ditagih (AR)", render: (r) => formatRupiah(r.totalInvoiced), className: "text-right" },
    { key: "hpp", header: "Total HPP", render: (r) => formatRupiah(r.totalHpp), className: "text-right" },
    {
      key: "marginContract",
      header: "Margin (vs Nilai Kontrak)",
      render: (r) => (
        <span className={r.marginByContractValue >= 0 ? "text-sage-deep font-semibold" : "text-destructive font-semibold"}>
          {formatRupiah(r.marginByContractValue)}
        </span>
      ),
      className: "text-right",
    },
    {
      key: "marginInvoiced",
      header: "Margin (vs Ditagih)",
      render: (r) => (
        <span className={r.marginByInvoiced >= 0 ? "text-sage-deep font-semibold" : "text-destructive font-semibold"}>
          {formatRupiah(r.marginByInvoiced)}
        </span>
      ),
      className: "text-right",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[17px] font-extrabold text-ink">Margin Proyek</h1>
        <p className="text-sm text-ink-muted mt-1">
          Margin {company.name} per kontrak — nilai kontrak/AR dikurangi total biaya langsung (HPP).
        </p>
      </div>

      <Card
        title="Catatan"
        description="Margin (vs Nilai Kontrak) memakai nilai kontrak penuh dari CRM. Margin (vs Ditagih) memakai total invoice AR yang sudah diposting — lebih akurat kalau kontrak baru ditagih sebagian."
      >
        <DataTable columns={columns} rows={marginRows} rowKey={(r) => r.contract.id} emptyMessage="Belum ada kontrak untuk company ini." />
      </Card>
    </div>
  );
}
