"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { cpdActivities, cpdSettings } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { logAudit } from "@/lib/audit/log";

const CATEGORIES = ["internal", "eksternal"] as const;

export async function createCpdActivity(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/sdm/cpd`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "CREATE_CPD_ACTIVITY")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mencatat aktivitas CPD.")}`);
  }

  const employeeId = formData.get("employeeId")?.toString() ?? "";
  const activityName = formData.get("activityName")?.toString().trim() ?? "";
  const categoryRaw = formData.get("category")?.toString() ?? "";
  const organizer = formData.get("organizer")?.toString().trim() || null;
  const durationHours = formData.get("durationHours")?.toString() ?? "";
  const activityDate = formData.get("activityDate")?.toString() || null;
  const year = Number(formData.get("year"));

  if (!employeeId || !activityName || !CATEGORIES.includes(categoryRaw as (typeof CATEGORIES)[number]) || !durationHours || !Number.isFinite(year)) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Karyawan, nama aktivitas, kategori, durasi jam, dan tahun wajib diisi.")}`);
  }
  const category = categoryRaw as (typeof CATEGORIES)[number];

  const [activity] = await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
    tx
      .insert(cpdActivities)
      .values({ companyId, employeeId, activityName, category, organizer, durationHours, activityDate, year, createdBy: session.user.id })
      .returning()
  );

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "create_cpd_activity",
    entityType: "cpd_activity",
    entityId: activity.id,
    metadata: { employeeId, activityName, durationHours, year },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function updateCpdSettings(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/sdm/cpd`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_CPD_SETTINGS")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengatur target CPD.")}`);
  }

  const annualTargetHours = formData.get("annualTargetHours")?.toString().trim() || null;

  await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
    tx
      .insert(cpdSettings)
      .values({ companyId, annualTargetHours })
      .onConflictDoUpdate({ target: cpdSettings.companyId, set: { annualTargetHours, updatedAt: new Date() } })
  );

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "update_cpd_settings",
    entityType: "cpd_settings",
    metadata: { annualTargetHours },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}
