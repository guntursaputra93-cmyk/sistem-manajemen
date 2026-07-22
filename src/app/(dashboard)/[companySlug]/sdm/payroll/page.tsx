import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, payrollRuns } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { createPayrollRun } from "./actions";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormDrawer, DrawerFooter } from "@/components/ui/FormDrawer";
import { FormSection, FormField, inputClass } from "@/components/ui/FormField";

const STATUS_LABEL: Record<string, string> = { draft: "Draft", diproses: "Diproses", selesai: "Selesai" };
const STATUS_VARIANT: Record<string, "sage" | "powder-blue" | "dusty-rose" | "destructive"> = {
  draft: "powder-blue",
  diproses: "dusty-rose",
  selesai: "sage",
};
const MONTH_LABEL = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

export default async function PayrollPage({
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

  if (!hasPermission(session.user.role, "VIEW_PAYROLL_RUNS")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "sdm_payroll", companySlug }));

  const runList = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(payrollRuns).where(eq(payrollRuns.companyId, company.id)).orderBy(desc(payrollRuns.periodYear), desc(payrollRuns.periodMonth))
  );

  const canRun = hasPermission(session.user.role, "RUN_PAYROLL");
  const currentDate = new Date();

  const columns: DataTableColumn<(typeof runList)[number]>[] = [
    {
      key: "period",
      header: "Periode",
      render: (r) => (
        <Link href={`/${companySlug}/sdm/payroll/${r.id}`} className="font-semibold text-sage-deep hover:underline">
          {MONTH_LABEL[r.periodMonth - 1]} {r.periodYear}
        </Link>
      ),
    },
    { key: "status", header: "Status", render: (r) => <Badge variant={STATUS_VARIANT[r.status] ?? "powder-blue"}>{STATUS_LABEL[r.status] ?? r.status}</Badge> },
    { key: "processedAt", header: "Diproses", render: (r) => (r.processedAt ? new Date(r.processedAt).toLocaleDateString("id-ID") : "-") },
  ];

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: "SDM" }, { label: "Payroll" }]}
        title="Payroll"
        description={`Riwayat payroll run ${company.name}.`}
        actions={
          canRun && (
            <FormDrawer buttonLabel="Buat Payroll Run" title="Buat Payroll Run" defaultOpen={Boolean(error)}>
              {error && (
                <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-ink">
                  {error}
                </div>
              )}
              <form action={createPayrollRun}>
                <input type="hidden" name="companySlug" value={companySlug} />
                <input type="hidden" name="companyId" value={company.id} />
                <FormSection title="Periode">
                  <FormField label="Bulan *">
                    <select name="periodMonth" defaultValue={currentDate.getMonth() + 1} required className={inputClass}>
                      {MONTH_LABEL.map((label, i) => (
                        <option key={label} value={i + 1}>{label}</option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Tahun *">
                    <input autoComplete="off" name="periodYear" type="number" defaultValue={currentDate.getFullYear()} required className={inputClass} />
                  </FormField>
                </FormSection>
                <DrawerFooter submitLabel="Buat Payroll Run" />
              </form>
            </FormDrawer>
          )
        }
      />

      {success && (
        <div className="mb-4 rounded-lg border border-sage-deep/20 bg-sage/20 px-4 py-3 text-[13px] text-ink">
          Berhasil disimpan.
        </div>
      )}

      <DataTable columns={columns} rows={runList} rowKey={(r) => r.id} emptyMessage="Belum ada payroll run." />
    </div>
  );
}
