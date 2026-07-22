"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { leaveTypes } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabledForAction } from "@/lib/modules";
import { logAudit } from "@/lib/audit/log";

export async function createLeaveType(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/sdm/jenis-cuti`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_LEAVE_TYPES")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengatur jenis cuti.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "sdm_cuti_absensi" });

  const code = formData.get("code")?.toString().trim() ?? "";
  const name = formData.get("name")?.toString().trim() ?? "";
  const defaultQuotaPerYear = Number(formData.get("defaultQuotaPerYear"));
  const isPaid = formData.get("isPaid")?.toString() === "true";

  if (!code || !name || !Number.isFinite(defaultQuotaPerYear) || defaultQuotaPerYear < 0) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Kode, nama, dan kuota tahunan wajib diisi dengan benar.")}`);
  }

  const [leaveType] = await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
    tx.insert(leaveTypes).values({ companyId, code, name, defaultQuotaPerYear, isPaid }).returning()
  );

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "create_leave_type",
    entityType: "leave_type",
    entityId: leaveType.id,
    metadata: { code, name, defaultQuotaPerYear },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function updateLeaveType(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const leaveTypeId = formData.get("leaveTypeId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/sdm/jenis-cuti`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_LEAVE_TYPES")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengatur jenis cuti.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "sdm_cuti_absensi" });

  const name = formData.get("name")?.toString().trim() ?? "";
  const defaultQuotaPerYear = Number(formData.get("defaultQuotaPerYear"));
  const isPaid = formData.get("isPaid")?.toString() === "true";

  if (!name || !Number.isFinite(defaultQuotaPerYear) || defaultQuotaPerYear < 0) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Nama dan kuota tahunan wajib diisi dengan benar.")}`);
  }

  await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
    tx
      .update(leaveTypes)
      .set({ name, defaultQuotaPerYear, isPaid, updatedAt: new Date() })
      .where(and(eq(leaveTypes.id, leaveTypeId), eq(leaveTypes.companyId, companyId)))
  );

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "update_leave_type",
    entityType: "leave_type",
    entityId: leaveTypeId,
    metadata: { name, defaultQuotaPerYear },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}
