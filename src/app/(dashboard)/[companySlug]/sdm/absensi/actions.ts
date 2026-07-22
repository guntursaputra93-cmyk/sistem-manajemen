"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { attendanceRecords } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabledForAction } from "@/lib/modules";
import { logAudit } from "@/lib/audit/log";

const ATTENDANCE_STATUSES = ["hadir", "izin", "sakit", "alpha", "cuti"] as const;

export async function recordAttendance(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/sdm/absensi`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_ATTENDANCE")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mencatat absensi.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "sdm_cuti_absensi" });

  const employeeId = formData.get("employeeId")?.toString() ?? "";
  const attendanceDate = formData.get("attendanceDate")?.toString() || "";
  const statusRaw = formData.get("status")?.toString() ?? "";
  const notes = formData.get("notes")?.toString().trim() || null;

  if (!employeeId || !attendanceDate || !ATTENDANCE_STATUSES.includes(statusRaw as (typeof ATTENDANCE_STATUSES)[number])) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Karyawan, tanggal, dan status wajib diisi.")}`);
  }
  const status = statusRaw as (typeof ATTENDANCE_STATUSES)[number];

  await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
    tx
      .insert(attendanceRecords)
      .values({ companyId, employeeId, attendanceDate, status, notes })
      .onConflictDoUpdate({
        target: [attendanceRecords.employeeId, attendanceRecords.attendanceDate],
        set: { status, notes },
      })
  );

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "record_attendance",
    entityType: "attendance_record",
    metadata: { employeeId, attendanceDate, status },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}
