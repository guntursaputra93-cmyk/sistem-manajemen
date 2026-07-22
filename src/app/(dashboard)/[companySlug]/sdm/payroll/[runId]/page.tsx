import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, payrollRuns, payslips, employees } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { generatePayslipsAction, finalizePayrollRunAction } from "../actions";
import { Card } from "@/components/ui/Card";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { TrailStepper, type TrailStep } from "@/components/ui/TrailStepper";
import { PageHeader } from "@/components/ui/PageHeader";

const STATUS_LABEL: Record<string, string> = { draft: "Draft", diproses: "Diproses", selesai: "Selesai" };
const RUN_STEPS = ["draft", "diproses", "selesai"] as const;
const MONTH_LABEL = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

export default async function PayrollRunDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ companySlug: string; runId: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { companySlug, runId } = await params;
  const { error, success } = await searchParams;
  const session = await auth();
  if (!session?.user) return null;

  if (!hasPermission(session.user.role, "VIEW_PAYROLL_RUNS")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId, userId: session.user.id };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "sdm_payroll", companySlug }));

  const [run] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(payrollRuns).where(and(eq(payrollRuns.id, runId), eq(payrollRuns.companyId, company.id)))
  );
  if (!run) notFound();

  const [payslipRows, empList] = await Promise.all([
    withTenantContext(tenantContext, (tx) => tx.select().from(payslips).where(eq(payslips.payrollRunId, run.id))),
    withTenantContext(tenantContext, (tx) => tx.select().from(employees).where(eq(employees.companyId, company.id))),
  ]);

  const canRun = hasPermission(session.user.role, "RUN_PAYROLL");

  const currentStepIndex = RUN_STEPS.indexOf(run.status);
  // processedAt diset di generatePayslipsForRun (transisi draft->diproses), BUKAN di
  // finalizePayrollRun (diproses->selesai, tidak menyimpan timestamp sendiri) — jadi
  // captionnya melekat ke step "diproses", bukan "selesai".
  const runTrail: TrailStep[] = RUN_STEPS.map((step, i) => ({
    id: step,
    label: STATUS_LABEL[step],
    caption: step === "diproses" && run.processedAt ? new Date(run.processedAt).toLocaleDateString("id-ID") : undefined,
    status: i < currentStepIndex ? "done" : i === currentStepIndex ? (run.status === "selesai" ? "done" : "pending") : "upcoming",
  }));

  const columns: DataTableColumn<(typeof payslipRows)[number]>[] = [
    {
      key: "employee",
      header: "Karyawan",
      render: (p) => (
        <Link href={`/${companySlug}/sdm/payroll/${run.id}/${p.id}`} className="font-medium text-sage-deep hover:underline">
          {empList.find((e) => e.id === p.employeeId)?.fullName ?? "-"}
        </Link>
      ),
    },
    { key: "gross", header: "Pendapatan", render: (p) => `Rp ${Number(p.grossSalaryAmount).toLocaleString("id-ID")}` },
    { key: "deductions", header: "Potongan", render: (p) => `Rp ${Number(p.salaryDeductions).toLocaleString("id-ID")}` },
    { key: "net", header: "Gaji Bersih", render: (p) => `Rp ${Number(p.netSalaryAmount).toLocaleString("id-ID")}` },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={[
          { label: "SDM" },
          { label: "Payroll", href: `/${companySlug}/sdm/payroll` },
          { label: `${MONTH_LABEL[run.periodMonth - 1]} ${run.periodYear}` },
        ]}
        title={`Payroll ${MONTH_LABEL[run.periodMonth - 1]} ${run.periodYear}`}
      />

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      <Card title="Status Payroll Run">
        <TrailStepper orientation="horizontal" steps={runTrail} />
      </Card>

      {canRun && run.status === "draft" && (
        <Card title="Generate Payslip">
          <p className="text-sm text-ink-muted mb-4">
            Membuat payslip untuk semua karyawan aktif berdasarkan struktur gaji yang efektif di periode ini. Karyawan tanpa struktur gaji akan dilewati.
          </p>
          <form action={generatePayslipsAction}>
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="companyId" value={company.id} />
            <input type="hidden" name="payrollRunId" value={run.id} />
            <input type="hidden" name="periodMonth" value={run.periodMonth} />
            <input type="hidden" name="periodYear" value={run.periodYear} />
            <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]">
              Generate Payslip
            </button>
          </form>
        </Card>
      )}

      {canRun && run.status === "diproses" && (
        <Card title="Selesaikan Payroll Run">
          <p className="text-sm text-ink-muted mb-4">Menandai payroll run ini selesai — payslip tidak bisa di-generate ulang setelah ini.</p>
          <form action={finalizePayrollRunAction}>
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="companyId" value={company.id} />
            <input type="hidden" name="payrollRunId" value={run.id} />
            <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]">
              Tandai Selesai
            </button>
          </form>
        </Card>
      )}

      <DataTable columns={columns} rows={payslipRows} rowKey={(p) => p.id} emptyMessage="Belum ada payslip untuk periode ini." />
    </div>
  );
}
