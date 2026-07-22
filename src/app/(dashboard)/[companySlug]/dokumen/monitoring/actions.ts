"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, dashboardSettings } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabledForAction } from "@/lib/modules";
import { logAudit } from "@/lib/audit/log";

export async function updateDashboardSettings(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const redirectBase = `/${companySlug}/dokumen/monitoring`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_DASHBOARD_SETTINGS")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengubah ambang dashboard.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "pengendalian_dokumen" });

  const stalledThresholdDays = Number.parseInt(formData.get("stalledThresholdDays")?.toString() ?? "", 10);
  const expiryWarningDays = Number.parseInt(formData.get("expiryWarningDays")?.toString() ?? "", 10);

  if (!Number.isInteger(stalledThresholdDays) || stalledThresholdDays < 1 || !Number.isInteger(expiryWarningDays) || expiryWarningDays < 1) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Ambang waktu harus angka >= 1.")}`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };
  const [company] = await withTenantContext(tenantContext, (tx) => tx.select().from(companies).where(eq(companies.slug, companySlug)));
  if (!company) redirect(`${redirectBase}?error=${encodeURIComponent("Perusahaan tidak ditemukan.")}`);

  await withTenantContext(tenantContext, (tx) =>
    tx
      .insert(dashboardSettings)
      .values({ companyId: company.id, stalledThresholdDays, expiryWarningDays })
      .onConflictDoUpdate({
        target: dashboardSettings.companyId,
        set: { stalledThresholdDays, expiryWarningDays, updatedAt: new Date() },
      })
  );

  await logAudit({
    companyId: company.id,
    userId: session.user.id,
    action: "update_dashboard_settings",
    entityType: "dashboard_settings",
    metadata: { stalledThresholdDays, expiryWarningDays },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}
