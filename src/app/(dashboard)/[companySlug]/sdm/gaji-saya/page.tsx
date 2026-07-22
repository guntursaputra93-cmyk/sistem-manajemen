import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, payslips, payrollRuns } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { getEmployeeByUserId } from "@/lib/hr/employees";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";

const MONTH_LABEL = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

export default async function GajiSayaPage({
  params,
}: {
  params: Promise<{ companySlug: string }>;
}) {
  const { companySlug } = await params;
  const session = await auth();
  if (!session?.user) return null;

  if (!hasPermission(session.user.role, "VIEW_PAYSLIPS")) {
    redirect(`/${companySlug}/dashboard`);
  }

  // userId WAJIB dikirim — RLS row-level payslips (migrasi 0043) yang membatasi
  // hasil query ke baris milik sendiri, bukan filter app-level manual di sini.
  const tenantContext = { role: session.user.role, companyId: session.user.companyId, userId: session.user.id };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "sdm_payroll", companySlug }));

  const employee = await withTenantContext(tenantContext, (tx) => getEmployeeByUserId(tx, { companyId: company.id, userId: session.user.id }));

  if (!employee) {
    return (
      <div>
        <PageHeader breadcrumb={[{ label: "SDM" }, { label: "Gaji Saya" }]} title="Gaji Saya" />
        <EmptyState message="Akun Anda belum terhubung ke data karyawan — hubungi admin." />
      </div>
    );
  }

  // Query employeeId eksplisit di WHERE (bukan cuma andalkan RLS) — RLS row-level
  // payslips sudah menahan baris orang lain di level DB, tapi filter eksplisit ini
  // membuat maksud query jelas dibaca ("punya sendiri", bukan "semua yang boleh saya lihat").
  const [payslipRows, runsById] = await withTenantContext(tenantContext, async (tx) => {
    const rows = await tx.select().from(payslips).where(eq(payslips.employeeId, employee.id)).orderBy(desc(payslips.createdAt));
    const runs = await tx.select().from(payrollRuns).where(eq(payrollRuns.companyId, company.id));
    return [rows, new Map(runs.map((r) => [r.id, r]))] as const;
  });

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: "SDM" }, { label: "Gaji Saya" }]}
        title="Gaji Saya"
        description="Riwayat slip gaji milikmu."
      />

      <Card title="Riwayat Slip Gaji">
        {payslipRows.length === 0 ? (
          <EmptyState message="Belum ada slip gaji. Slip gaji akan muncul di sini setelah payroll diproses." />
        ) : (
          <ul className="space-y-2 text-[13px]">
            {payslipRows.map((p) => {
              const run = runsById.get(p.payrollRunId);
              return (
                <li key={p.id} className="flex items-center justify-between border-b border-ink-muted/10 pb-2">
                  <Link href={`/${companySlug}/sdm/payroll/${p.payrollRunId}/${p.id}`} className="font-semibold text-sage-deep hover:underline">
                    {run ? `${MONTH_LABEL[run.periodMonth - 1]} ${run.periodYear}` : "-"}
                  </Link>
                  <span className="text-ink">Rp {Number(p.netSalaryAmount).toLocaleString("id-ID")}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
