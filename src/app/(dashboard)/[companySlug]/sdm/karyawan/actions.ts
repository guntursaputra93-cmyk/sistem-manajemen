"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { employees } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabledForAction } from "@/lib/modules";
import { logAudit } from "@/lib/audit/log";
import { changeEmployeePosition } from "@/lib/hr/employees";

const EMPLOYMENT_STATUSES = ["aktif", "cuti_panjang", "resign", "diberhentikan"] as const;
const CHANGE_TYPES = ["awal", "promosi", "demosi", "mutasi"] as const;

export async function createEmployee(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/sdm/karyawan`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_EMPLOYEES")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin membuat data karyawan.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "sdm_data_karyawan" });

  const nik = formData.get("nik")?.toString().trim() ?? "";
  const fullName = formData.get("fullName")?.toString().trim() ?? "";
  const email = formData.get("email")?.toString().trim().toLowerCase() || null;
  const npwp = formData.get("npwp")?.toString().trim() || null;
  const joinDate = formData.get("joinDate")?.toString() || "";
  const positionTitle = formData.get("positionTitle")?.toString().trim() ?? "";
  const departmentId = formData.get("departmentId")?.toString() || null;
  const jobLevel = formData.get("jobLevel")?.toString().trim() || null;
  const phone = formData.get("phone")?.toString().trim() || null;
  const address = formData.get("address")?.toString().trim() || null;
  const emergencyContactName = formData.get("emergencyContactName")?.toString().trim() || null;
  const emergencyContactPhone = formData.get("emergencyContactPhone")?.toString().trim() || null;
  const birthDate = formData.get("birthDate")?.toString() || null;

  if (!nik || !fullName || !joinDate || !positionTitle) {
    redirect(`${redirectBase}?error=${encodeURIComponent("NIK, nama, tanggal bergabung, dan jabatan wajib diisi.")}`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId, userId: session.user.id };

  const employeeId = await withTenantContext(tenantContext, async (tx) => {
    const [emp] = await tx
      .insert(employees)
      .values({ companyId, nik, fullName, email, npwp, joinDate, phone, address, emergencyContactName, emergencyContactPhone, birthDate })
      .returning();

    await changeEmployeePosition(tx, {
      companyId,
      employeeId: emp.id,
      positionTitle,
      departmentId,
      jobLevel,
      changeType: "awal",
      notes: null,
      effectiveDate: joinDate,
      changedBy: session.user.id,
    });

    return emp.id;
  });

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "create_employee",
    entityType: "employee",
    entityId: employeeId,
    metadata: { nik, fullName },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}/${employeeId}?success=1`);
}

export async function updateEmployee(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const employeeId = formData.get("employeeId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/sdm/karyawan/${employeeId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_EMPLOYEES")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengubah data karyawan.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "sdm_data_karyawan" });

  const nik = formData.get("nik")?.toString().trim() ?? "";
  const fullName = formData.get("fullName")?.toString().trim() ?? "";
  const email = formData.get("email")?.toString().trim().toLowerCase() || null;
  const npwp = formData.get("npwp")?.toString().trim() || null;
  const phone = formData.get("phone")?.toString().trim() || null;
  const address = formData.get("address")?.toString().trim() || null;
  const emergencyContactName = formData.get("emergencyContactName")?.toString().trim() || null;
  const emergencyContactPhone = formData.get("emergencyContactPhone")?.toString().trim() || null;
  const birthDate = formData.get("birthDate")?.toString() || null;

  if (!nik || !fullName) {
    redirect(`${redirectBase}?error=${encodeURIComponent("NIK dan nama wajib diisi.")}`);
  }

  await withTenantContext({ role: session.user.role, companyId: session.user.companyId, userId: session.user.id }, (tx) =>
    tx
      .update(employees)
      .set({ nik, fullName, email, npwp, phone, address, emergencyContactName, emergencyContactPhone, birthDate, updatedAt: new Date() })
      .where(and(eq(employees.id, employeeId), eq(employees.companyId, companyId)))
  );

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "update_employee",
    entityType: "employee",
    entityId: employeeId,
    metadata: { nik, fullName },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function changeEmployeePositionAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const employeeId = formData.get("employeeId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/sdm/karyawan/${employeeId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_POSITION_HISTORY")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengubah posisi karyawan.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "sdm_data_karyawan" });

  const positionTitle = formData.get("positionTitle")?.toString().trim() ?? "";
  const departmentId = formData.get("departmentId")?.toString() || null;
  const jobLevel = formData.get("jobLevel")?.toString().trim() || null;
  const changeTypeRaw = formData.get("changeType")?.toString() ?? "";
  const notes = formData.get("notes")?.toString().trim() || null;
  const effectiveDate = formData.get("effectiveDate")?.toString() || "";

  if (!positionTitle || !effectiveDate || !CHANGE_TYPES.includes(changeTypeRaw as (typeof CHANGE_TYPES)[number])) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Jabatan, jenis perubahan, dan tanggal efektif wajib diisi.")}`);
  }
  const changeType = changeTypeRaw as (typeof CHANGE_TYPES)[number];

  await withTenantContext({ role: session.user.role, companyId: session.user.companyId, userId: session.user.id }, (tx) =>
    changeEmployeePosition(tx, {
      companyId,
      employeeId,
      positionTitle,
      departmentId,
      jobLevel,
      changeType,
      notes,
      effectiveDate,
      changedBy: session.user.id,
    })
  );

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "change_employee_position",
    entityType: "employee",
    entityId: employeeId,
    metadata: { positionTitle, departmentId, changeType, effectiveDate },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function updateEmployeeStatusAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const employeeId = formData.get("employeeId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/sdm/karyawan/${employeeId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_EMPLOYEES")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengubah status karyawan.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "sdm_data_karyawan" });

  const newStatus = formData.get("employmentStatus")?.toString() ?? "";
  const resignDate = formData.get("resignDate")?.toString() || null;

  if (!EMPLOYMENT_STATUSES.includes(newStatus as (typeof EMPLOYMENT_STATUSES)[number])) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Status tidak valid.")}`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId, userId: session.user.id };

  const oldStatus = await withTenantContext(tenantContext, async (tx) => {
    const [existing] = await tx.select().from(employees).where(and(eq(employees.id, employeeId), eq(employees.companyId, companyId)));
    await tx
      .update(employees)
      .set({
        employmentStatus: newStatus as (typeof EMPLOYMENT_STATUSES)[number],
        resignDate: newStatus === "resign" || newStatus === "diberhentikan" ? resignDate : null,
        updatedAt: new Date(),
      })
      .where(and(eq(employees.id, employeeId), eq(employees.companyId, companyId)));
    return existing?.employmentStatus ?? null;
  });

  // Wajib dicatat di audit_trails (spec Bagian 4.3: "perubahan status karyawan").
  await logAudit({
    companyId,
    userId: session.user.id,
    action: "update_employee_status",
    entityType: "employee",
    entityId: employeeId,
    metadata: { employeeId, oldStatus, newStatus },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}
