"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companyModules } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { logAudit } from "@/lib/audit/log";
import { MODULE_KEYS } from "@/lib/modules";

export async function toggleModule(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const moduleKey = formData.get("moduleKey")?.toString() ?? "";
  const enable = formData.get("enable")?.toString() === "true";
  const redirectBase = `/${companySlug}/pengaturan/modul`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_MODULES")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengatur modul.")}`);
  }

  if (!MODULE_KEYS.includes(moduleKey as (typeof MODULE_KEYS)[number])) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Modul tidak valid.")}`);
  }

  await withTenantContext({ role: session.user.role, companyId }, (tx) =>
    tx
      .insert(companyModules)
      .values({ companyId, moduleKey, isEnabled: enable })
      .onConflictDoUpdate({
        target: [companyModules.companyId, companyModules.moduleKey],
        set: { isEnabled: enable, updatedAt: new Date() },
      })
  );

  await logAudit({
    companyId,
    userId: session.user.id,
    action: enable ? "enable_module" : "disable_module",
    entityType: "company_module",
    metadata: { moduleKey },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}
