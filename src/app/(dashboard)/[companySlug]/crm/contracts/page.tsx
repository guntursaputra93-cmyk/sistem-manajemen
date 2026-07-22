import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, contracts, opportunities, organizations, users } from "@/drizzle/schema";
import { hasPermission, type Role } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { getVisibleAssigneeIds } from "@/lib/crm/opportunities";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/PageHeader";

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  belum_dibayar: "Belum Dibayar",
  sebagian: "Sebagian",
  lunas: "Lunas",
};

const PAYMENT_STATUS_VARIANT: Record<string, BadgeVariant> = {
  belum_dibayar: "dusty-rose",
  sebagian: "powder-blue",
  lunas: "sage",
};

export default async function ContractsPage({
  params,
}: {
  params: Promise<{ companySlug: string }>;
}) {
  const { companySlug } = await params;
  const session = await auth();
  if (!session?.user) return null;

  if (!hasPermission(session.user.role, "VIEW_CONTRACTS")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) => tx.select().from(companies).where(eq(companies.slug, companySlug)));
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "crm", companySlug }));

  const [selfUser, orgList, oppList] = await Promise.all([
    withTenantContext(tenantContext, (tx) => tx.select().from(users).where(eq(users.id, session.user.id))).then((r) => r[0]),
    withTenantContext(tenantContext, (tx) => tx.select().from(organizations).where(eq(organizations.companyId, company.id))),
    withTenantContext(tenantContext, (tx) => tx.select().from(opportunities).where(eq(opportunities.companyId, company.id))),
  ]);

  const viewer = { userId: session.user.id, role: session.user.role as Role, departmentId: selfUser?.departmentId ?? null };
  const visibleAssigneeIds = await withTenantContext(tenantContext, (tx) => getVisibleAssigneeIds(tx, { companyId: company.id, viewer }));

  const contractList = await withTenantContext(tenantContext, (tx) => tx.select().from(contracts).where(eq(contracts.companyId, company.id))).then((rows) =>
    visibleAssigneeIds
      ? rows.filter((c) => {
          const opp = oppList.find((o) => o.id === c.opportunityId);
          return opp && visibleAssigneeIds.includes(opp.assignedTo);
        })
      : rows
  );

  const columns: DataTableColumn<(typeof contractList)[number]>[] = [
    { key: "org", header: "Organisasi", render: (c) => orgList.find((o) => o.id === c.organizationId)?.name ?? "-" },
    {
      key: "deal",
      header: "Deal",
      render: (c) => (
        <a href={`/${companySlug}/crm/contracts/${c.id}`} className="font-medium text-sage-deep hover:underline">
          {oppList.find((o) => o.id === c.opportunityId)?.title ?? "-"}
        </a>
      ),
    },
    { key: "value", header: "Nilai Kontrak", render: (c) => `Rp ${Number(c.contractValue).toLocaleString("id-ID")}` },
    { key: "start", header: "Mulai", render: (c) => c.startDate },
    { key: "end", header: "Selesai", render: (c) => c.endDate ?? "-" },
    {
      key: "payment",
      header: "Status Bayar",
      render: (c) => <Badge variant={PAYMENT_STATUS_VARIANT[c.paymentStatus] ?? "powder-blue"}>{PAYMENT_STATUS_LABEL[c.paymentStatus] ?? c.paymentStatus}</Badge>,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={[{ label: "CRM" }, { label: "Contract" }]}
        title="Contract"
        description={'Dibuat otomatis saat opportunity pindah ke tahap "menang".'}
      />

      <DataTable columns={columns} rows={contractList} rowKey={(c) => c.id} emptyMessage="Belum ada contract. Contract akan dibuat otomatis saat opportunity menang." />
    </div>
  );
}
