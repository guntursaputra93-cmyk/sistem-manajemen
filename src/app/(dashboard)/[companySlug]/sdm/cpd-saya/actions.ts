"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { cpdActivities } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { logAudit } from "@/lib/audit/log";
import { getEmployeeByUserId } from "@/lib/hr/employees";

const CATEGORIES = ["internal", "eksternal"] as const;

/**
 * Sama seperti createCpdActivity di ../cpd/actions.ts, TAPI employeeId diambil dari
 * akun yang login (bukan dipilih dari dropdown) — self-service selalu catat milik
 * sendiri, tidak bisa catat untuk karyawan lain lewat halaman ini.
 */
export async function createCpdActivitySelf(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/sdm/cpd-saya`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "CREATE_CPD_ACTIVITY")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mencatat aktivitas CPD.")}`);
  }

  const activityName = formData.get("activityName")?.toString().trim() ?? "";
  const categoryRaw = formData.get("category")?.toString() ?? "";
  const organizer = formData.get("organizer")?.toString().trim() || null;
  const durationHours = formData.get("durationHours")?.toString() ?? "";
  const activityDate = formData.get("activityDate")?.toString() || null;
  const year = Number(formData.get("year"));

  if (!activityName || !CATEGORIES.includes(categoryRaw as (typeof CATEGORIES)[number]) || !durationHours || !Number.isFinite(year)) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Nama aktivitas, kategori, durasi jam, dan tahun wajib diisi.")}`);
  }
  const category = categoryRaw as (typeof CATEGORIES)[number];

  const tenantContext = { role: session.user.role, companyId: session.user.companyId, userId: session.user.id };

  const employee = await withTenantContext(tenantContext, (tx) => getEmployeeByUserId(tx, { companyId, userId: session.user.id }));
  if (!employee) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Akun Anda belum terhubung ke data karyawan — hubungi admin.")}`);
  }

  const [activity] = await withTenantContext(tenantContext, (tx) =>
    tx
      .insert(cpdActivities)
      .values({ companyId, employeeId: employee.id, activityName, category, organizer, durationHours, activityDate, year, createdBy: session.user.id })
      .returning()
  );

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "create_cpd_activity",
    entityType: "cpd_activity",
    entityId: activity.id,
    metadata: { employeeId: employee.id, activityName, durationHours, year },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}
