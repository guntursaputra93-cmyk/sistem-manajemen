import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, payrollRuns, payslips, employees } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { Card } from "@/components/ui/Card";
import { TrailStepper, type TrailStep } from "@/components/ui/TrailStepper";
import type { PayslipDetailEntry } from "@/lib/hr/payroll";

const STATUS_LABEL: Record<string, string> = { draft: "Draft", diproses: "Diproses", selesai: "Selesai" };
const RUN_STEPS = ["draft", "diproses", "selesai"] as const;
const MONTH_LABEL = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

export default async function PayslipDetailPage({
  params,
}: {
  params: Promise<{ companySlug: string; runId: string; payslipId: string }>;
}) {
  const { companySlug, runId, payslipId } = await params;
  const session = await auth();
  if (!session?.user) return null;

  if (!hasPermission(session.user.role, "VIEW_PAYSLIPS")) {
    redirect(`/${companySlug}/dashboard`);
  }

  // userId WAJIB dikirim — RLS row-level payslips (migrasi 0043) pakai ini untuk
  // membatasi staff/department_head hanya lihat slip gajinya sendiri. Kalau baris
  // ini bukan milik viewer dan viewer bukan admin, query di bawah pulang kosong
  // (bukan error) — notFound() menangani itu secara seragam.
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

  const [payslip] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(payslips).where(and(eq(payslips.id, payslipId), eq(payslips.payrollRunId, run.id), eq(payslips.companyId, company.id)))
  );
  if (!payslip) notFound();

  const [employee] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(employees).where(eq(employees.id, payslip.employeeId))
  );

  const detail = (payslip.payslipDetail as PayslipDetailEntry[]) ?? [];

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

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-[17px] font-extrabold text-ink">
          Slip Gaji — {MONTH_LABEL[run.periodMonth - 1]} {run.periodYear}
        </h1>
        <p className="text-sm text-ink-muted mt-1">{employee?.fullName ?? "-"}</p>
      </div>

      <Card title="Status Payroll Run">
        <TrailStepper orientation="horizontal" steps={runTrail} />
      </Card>

      <Card title="Rincian Komponen">
        <table className="w-full text-sm mb-4">
          <thead className="text-ink-muted text-xs uppercase">
            <tr>
              <th className="text-left py-1">Komponen</th>
              <th className="text-left py-1">Tipe</th>
              <th className="text-right py-1">Nominal</th>
            </tr>
          </thead>
          <tbody>
            {detail.map((d, i) => (
              <tr key={i} className="border-t border-ink-muted/10">
                <td className="py-2">{d.componentName}</td>
                <td className="py-2">{d.componentType === "pendapatan" ? "Pendapatan" : "Potongan"}</td>
                <td className="py-2 text-right">Rp {Number(d.amount).toLocaleString("id-ID")}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="text-sm space-y-2 border-t border-ink-muted/10 pt-4">
          <div className="flex justify-between">
            <dt className="text-ink-muted">Total Pendapatan</dt>
            <dd className="text-ink">Rp {Number(payslip.grossSalaryAmount).toLocaleString("id-ID")}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-muted">Total Potongan</dt>
            <dd className="text-ink">Rp {Number(payslip.salaryDeductions).toLocaleString("id-ID")}</dd>
          </div>
          <div className="flex justify-between font-semibold">
            <dt className="text-ink">Gaji Bersih</dt>
            <dd className="text-ink">Rp {Number(payslip.netSalaryAmount).toLocaleString("id-ID")}</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
