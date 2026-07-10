import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, employees } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";

export default async function StrukturGajiPage({
  params,
}: {
  params: Promise<{ companySlug: string }>;
}) {
  const { companySlug } = await params;
  const session = await auth();
  if (!session?.user) return null;

  if (!hasPermission(session.user.role, "MANAGE_EMPLOYEE_SALARY_STRUCTURE")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "sdm_payroll", companySlug }));

  const empList = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(employees).where(eq(employees.companyId, company.id)).orderBy(asc(employees.fullName))
  );

  const columns: DataTableColumn<(typeof empList)[number]>[] = [
    {
      key: "name",
      header: "Karyawan",
      render: (e) => (
        <Link href={`/${companySlug}/sdm/struktur-gaji/${e.id}`} className="font-medium text-sage-deep hover:underline">
          {e.fullName}
        </Link>
      ),
    },
    { key: "position", header: "Jabatan", render: (e) => e.currentPositionTitle ?? "-" },
  ];

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-[17px] font-extrabold text-ink">Struktur Gaji Karyawan</h1>
        <p className="text-sm text-ink-muted mt-1">Pilih karyawan untuk atur komponen gaji — {company.name}.</p>
      </div>

      <DataTable columns={columns} rows={empList} rowKey={(e) => e.id} emptyMessage="Belum ada data karyawan." />
    </div>
  );
}
