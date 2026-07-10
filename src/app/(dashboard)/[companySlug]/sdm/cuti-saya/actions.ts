"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { leaveRequests } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { logAudit } from "@/lib/audit/log";
import { getEmployeeByUserId } from "@/lib/hr/employees";

function inclusiveDayCount(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * Sama persis dengan createLeaveRequest di ../cuti/actions.ts, HANYA beda redirect
 * target (kembali ke cuti-saya, bukan ke halaman admin /sdm/cuti) — supaya alur
 * self-service tidak melompat ke halaman yang beda konteks setelah submit.
 */
export async function createLeaveRequestSelf(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/sdm/cuti-saya`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "CREATE_LEAVE_REQUEST")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengajukan cuti.")}`);
  }

  const leaveTypeId = formData.get("leaveTypeId")?.toString() ?? "";
  const startDate = formData.get("startDate")?.toString() || "";
  const endDate = formData.get("endDate")?.toString() || "";
  const reason = formData.get("reason")?.toString().trim() || null;

  if (!leaveTypeId || !startDate || !endDate) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Jenis cuti, tanggal mulai, dan tanggal selesai wajib diisi.")}`);
  }
  if (endDate < startDate) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tanggal selesai tidak boleh sebelum tanggal mulai.")}`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId, userId: session.user.id };

  const employee = await withTenantContext(tenantContext, (tx) => getEmployeeByUserId(tx, { companyId, userId: session.user.id }));
  if (!employee) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Akun Anda belum terhubung ke data karyawan — hubungi admin.")}`);
  }

  const totalDays = inclusiveDayCount(startDate, endDate);

  const [request] = await withTenantContext(tenantContext, (tx) =>
    tx
      .insert(leaveRequests)
      .values({ companyId, employeeId: employee.id, leaveTypeId, startDate, endDate, totalDays, reason, status: "pending" })
      .returning()
  );

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "create_leave_request",
    entityType: "leave_request",
    entityId: request.id,
    metadata: { employeeId: employee.id, leaveTypeId, startDate, endDate, totalDays },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}
