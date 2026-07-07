"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { dashboardSettings } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { logAudit } from "@/lib/audit/log";

export async function updateDashboardSettings(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const redirectBase = `/${companySlug}/dashboard`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_DASHBOARD_SETTINGS")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengubah ambang dashboard.")}`);
  }

  const stalledThresholdDays = Number.parseInt(formData.get("stalledThresholdDays")?.toString() ?? "", 10);
  const expiryWarningDays = Number.parseInt(formData.get("expiryWarningDays")?.toString() ?? "", 10);

  if (!Number.isInteger(stalledThresholdDays) || stalledThresholdDays < 1 || !Number.isInteger(expiryWarningDays) || expiryWarningDays < 1) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Ambang waktu harus angka >= 1.")}`);
  }

  await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
    tx
      .insert(dashboardSettings)
      .values({ companyId: session.user.companyId, stalledThresholdDays, expiryWarningDays })
      .onConflictDoUpdate({
        target: dashboardSettings.companyId,
        set: { stalledThresholdDays, expiryWarningDays, updatedAt: new Date() },
      })
  );

  await logAudit({
    companyId: session.user.companyId,
    userId: session.user.id,
    action: "update_dashboard_settings",
    entityType: "dashboard_settings",
    metadata: { stalledThresholdDays, expiryWarningDays },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}
