"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { competencyTypes } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabledForAction } from "@/lib/modules";
import { logAudit } from "@/lib/audit/log";

export async function createCompetencyType(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/sdm/jenis-kompetensi`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_COMPETENCY_TYPES")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengatur jenis kompetensi.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "sdm_kompetensi" });

  const code = formData.get("code")?.toString().trim() ?? "";
  const name = formData.get("name")?.toString().trim() ?? "";
  const category = formData.get("category")?.toString().trim() || null;

  if (!code || !name) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Kode dan nama wajib diisi.")}`);
  }

  const [ct] = await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
    tx.insert(competencyTypes).values({ companyId, code, name, category }).returning()
  );

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "create_competency_type",
    entityType: "competency_type",
    entityId: ct.id,
    metadata: { code, name },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function updateCompetencyType(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const competencyTypeId = formData.get("competencyTypeId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/sdm/jenis-kompetensi`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_COMPETENCY_TYPES")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengatur jenis kompetensi.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "sdm_kompetensi" });

  const name = formData.get("name")?.toString().trim() ?? "";
  const category = formData.get("category")?.toString().trim() || null;

  if (!name) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Nama wajib diisi.")}`);
  }

  await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
    tx
      .update(competencyTypes)
      .set({ name, category, updatedAt: new Date() })
      .where(and(eq(competencyTypes.id, competencyTypeId), eq(competencyTypes.companyId, companyId)))
  );

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "update_competency_type",
    entityType: "competency_type",
    entityId: competencyTypeId,
    metadata: { name },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}
