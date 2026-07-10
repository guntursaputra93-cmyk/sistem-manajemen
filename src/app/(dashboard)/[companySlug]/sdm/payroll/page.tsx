import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, payrollRuns } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { createPayrollRun } from "./actions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";

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
        <Link href={`/${companySlug}/sdm/payroll/${r.id}`} className="font-medium text-sage-deep hover:underline">
          {MONTH_LABEL[r.periodMonth - 1]} {r.periodYear}
        </Link>
      ),
    },
    { key: "status", header: "Status", render: (r) => <Badge variant={STATUS_VARIANT[r.status] ?? "powder-blue"}>{STATUS_LABEL[r.status] ?? r.status}</Badge> },
    { key: "processedAt", header: "Diproses", render: (r) => (r.processedAt ? new Date(r.processedAt).toLocaleDateString("id-ID") : "-") },
  ];

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-[17px] font-extrabold text-ink">Payroll</h1>
        <p className="text-sm text-ink-muted mt-1">Riwayat payroll run {company.name}.</p>
      </div>

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      {canRun && (
        <Card title="Buat Payroll Run">
          <form action={createPayrollRun} className="grid grid-cols-3 gap-4 items-end">
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="companyId" value={company.id} />
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Bulan</label>
              <select name="periodMonth" defaultValue={currentDate.getMonth() + 1} required className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-surface">
                {MONTH_LABEL.map((label, i) => (
                  <option key={label} value={i + 1}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Tahun</label>
              <input name="periodYear" type="number" defaultValue={currentDate.getFullYear()} required className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-surface" />
            </div>
            <div>
              <button type="submit" className="bg-powder-blue-deep hover:bg-powder-blue-deep/90 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
                Buat
              </button>
            </div>
          </form>
        </Card>
      )}

      <DataTable columns={columns} rows={runList} rowKey={(r) => r.id} emptyMessage="Belum ada payroll run." />
    </div>
  );
}
