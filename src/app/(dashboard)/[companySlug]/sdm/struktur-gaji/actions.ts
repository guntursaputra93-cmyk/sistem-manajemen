"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { employeeSalaryStructures } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabledForAction } from "@/lib/modules";
import { logAudit } from "@/lib/audit/log";

export async function addSalaryStructure(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const employeeId = formData.get("employeeId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/sdm/struktur-gaji/${employeeId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_EMPLOYEE_SALARY_STRUCTURE")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengatur struktur gaji.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "sdm_payroll" });

  const salaryComponentId = formData.get("salaryComponentId")?.toString() ?? "";
  const salaryAmount = formData.get("salaryAmount")?.toString() ?? "";
  const effectiveDate = formData.get("effectiveDate")?.toString() || "";

  if (!salaryComponentId || !salaryAmount || !effectiveDate) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Komponen, nominal, dan tanggal efektif wajib diisi.")}`);
  }

  const [structure] = await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
    tx.insert(employeeSalaryStructures).values({ companyId, employeeId, salaryComponentId, salaryAmount, effectiveDate, createdBy: session.user.id }).returning()
  );

  // Audit WAJIB — spec Bagian 4.3: "audit trail untuk perubahan data gaji".
  // metadata SENGAJA tidak menyertakan salaryAmount mentah di sini (field metadata
  // jsonb audit_trails tidak melalui redaksi Sentry seperti error event, tapi tetap
  // data internal terbatas akses VIEW_AUDIT_TRAIL — nominal boleh tercatat).
  await logAudit({
    companyId,
    userId: session.user.id,
    action: "create_employee_salary_structure",
    entityType: "employee_salary_structure",
    entityId: structure.id,
    metadata: { employeeId, salaryComponentId, salaryAmount, effectiveDate },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function endSalaryStructure(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const employeeId = formData.get("employeeId")?.toString() ?? "";
  const structureId = formData.get("structureId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/sdm/struktur-gaji/${employeeId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_EMPLOYEE_SALARY_STRUCTURE")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengatur struktur gaji.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "sdm_payroll" });

  const endDate = formData.get("endDate")?.toString() || "";
  if (!endDate) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tanggal berakhir wajib diisi.")}`);
  }

  await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
    tx
      .update(employeeSalaryStructures)
      .set({ endDate })
      .where(and(eq(employeeSalaryStructures.id, structureId), eq(employeeSalaryStructures.companyId, companyId)))
  );

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "update_employee_salary_structure",
    entityType: "employee_salary_structure",
    entityId: structureId,
    metadata: { employeeId, endDate },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}
