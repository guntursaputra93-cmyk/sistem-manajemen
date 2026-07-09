"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { payrollRuns } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { logAudit } from "@/lib/audit/log";
import { generatePayslipsForRun, finalizePayrollRun, PayrollError } from "@/lib/hr/payroll";

export async function createPayrollRun(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/sdm/payroll`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "RUN_PAYROLL")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin membuat payroll run.")}`);
  }

  const periodMonth = Number(formData.get("periodMonth"));
  const periodYear = Number(formData.get("periodYear"));

  if (!Number.isFinite(periodMonth) || periodMonth < 1 || periodMonth > 12 || !Number.isFinite(periodYear)) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Bulan dan tahun periode wajib diisi dengan benar.")}`);
  }

  const [run] = await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
    tx.insert(payrollRuns).values({ companyId, periodMonth, periodYear, createdBy: session.user.id }).returning()
  );

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "create_payroll_run",
    entityType: "payroll_run",
    entityId: run.id,
    metadata: { periodMonth, periodYear },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}/${run.id}?success=1`);
}

export async function generatePayslipsAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const payrollRunId = formData.get("payrollRunId")?.toString() ?? "";
  const periodMonth = Number(formData.get("periodMonth"));
  const periodYear = Number(formData.get("periodYear"));
  const redirectBase = `/${companySlug}/sdm/payroll/${payrollRunId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "RUN_PAYROLL")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin memproses payroll.")}`);
  }

  let result;
  try {
    result = await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      generatePayslipsForRun(tx, { companyId, payrollRunId, periodMonth, periodYear, processedBy: session.user.id })
    );
  } catch (err) {
    if (err instanceof PayrollError) {
      redirect(`${redirectBase}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "generate_payslips",
    entityType: "payroll_run",
    entityId: payrollRunId,
    metadata: { generated: result.generated, skipped: result.skipped },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function finalizePayrollRunAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const payrollRunId = formData.get("payrollRunId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/sdm/payroll/${payrollRunId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "RUN_PAYROLL")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin menyelesaikan payroll.")}`);
  }

  try {
    await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      finalizePayrollRun(tx, { companyId, payrollRunId })
    );
  } catch (err) {
    if (err instanceof PayrollError) {
      redirect(`${redirectBase}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "finalize_payroll_run",
    entityType: "payroll_run",
    entityId: payrollRunId,
    metadata: {},
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}
