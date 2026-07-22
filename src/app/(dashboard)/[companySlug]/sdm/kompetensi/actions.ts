"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { employeeCompetencies } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabledForAction } from "@/lib/modules";
import { logAudit } from "@/lib/audit/log";

const STATUSES = ["aktif", "kedaluwarsa", "proses_perpanjangan"] as const;

export async function createEmployeeCompetency(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/sdm/kompetensi`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_EMPLOYEE_COMPETENCIES")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin menambah kompetensi karyawan.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "sdm_kompetensi" });

  const employeeId = formData.get("employeeId")?.toString() ?? "";
  const competencyTypeId = formData.get("competencyTypeId")?.toString() ?? "";
  const certificateNumber = formData.get("certificateNumber")?.toString().trim() || null;
  const sectorScheme = formData.get("sectorScheme")?.toString().trim() || null;
  const issuedDate = formData.get("issuedDate")?.toString() || null;
  const expiresAt = formData.get("expiresAt")?.toString() || null;

  if (!employeeId || !competencyTypeId) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Karyawan dan jenis kompetensi wajib diisi.")}`);
  }

  const [ec] = await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
    tx.insert(employeeCompetencies).values({ companyId, employeeId, competencyTypeId, certificateNumber, sectorScheme, issuedDate, expiresAt }).returning()
  );

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "create_employee_competency",
    entityType: "employee_competency",
    entityId: ec.id,
    metadata: { employeeId, competencyTypeId, expiresAt },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function updateEmployeeCompetency(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const employeeCompetencyId = formData.get("employeeCompetencyId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/sdm/kompetensi`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_EMPLOYEE_COMPETENCIES")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengubah kompetensi karyawan.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "sdm_kompetensi" });

  const certificateNumber = formData.get("certificateNumber")?.toString().trim() || null;
  const sectorScheme = formData.get("sectorScheme")?.toString().trim() || null;
  const issuedDate = formData.get("issuedDate")?.toString() || null;
  const expiresAt = formData.get("expiresAt")?.toString() || null;
  const statusRaw = formData.get("status")?.toString() ?? "";

  if (!STATUSES.includes(statusRaw as (typeof STATUSES)[number])) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Status tidak valid.")}`);
  }
  const status = statusRaw as (typeof STATUSES)[number];

  await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
    tx
      .update(employeeCompetencies)
      .set({ certificateNumber, sectorScheme, issuedDate, expiresAt, status, updatedAt: new Date() })
      .where(and(eq(employeeCompetencies.id, employeeCompetencyId), eq(employeeCompetencies.companyId, companyId)))
  );

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "update_employee_competency",
    entityType: "employee_competency",
    entityId: employeeCompetencyId,
    metadata: { status, expiresAt },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}
