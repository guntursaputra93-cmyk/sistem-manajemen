"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { salaryComponents } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabledForAction } from "@/lib/modules";
import { logAudit } from "@/lib/audit/log";

const COMPONENT_TYPES = ["pendapatan", "potongan"] as const;

export async function createSalaryComponent(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/sdm/komponen-gaji`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_SALARY_COMPONENTS")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengatur komponen gaji.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "sdm_payroll" });

  const code = formData.get("code")?.toString().trim() ?? "";
  const name = formData.get("name")?.toString().trim() ?? "";
  const componentTypeRaw = formData.get("componentType")?.toString() ?? "";

  if (!code || !name || !COMPONENT_TYPES.includes(componentTypeRaw as (typeof COMPONENT_TYPES)[number])) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Kode, nama, dan tipe komponen wajib diisi.")}`);
  }
  const componentType = componentTypeRaw as (typeof COMPONENT_TYPES)[number];
  // Akun kewajiban hanya relevan untuk potongan; diabaikan (null) untuk pendapatan.
  const liabilityAccountId = componentType === "potongan" ? formData.get("liabilityAccountId")?.toString() || null : null;

  const [sc] = await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
    tx.insert(salaryComponents).values({ companyId, code, name, componentType, liabilityAccountId }).returning()
  );

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "create_salary_component",
    entityType: "salary_component",
    entityId: sc.id,
    metadata: { code, name, componentType },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function updateSalaryComponent(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const salaryComponentId = formData.get("salaryComponentId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/sdm/komponen-gaji`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_SALARY_COMPONENTS")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengatur komponen gaji.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "sdm_payroll" });

  const name = formData.get("name")?.toString().trim() ?? "";
  const componentTypeRaw = formData.get("componentType")?.toString() ?? "";

  if (!name || !COMPONENT_TYPES.includes(componentTypeRaw as (typeof COMPONENT_TYPES)[number])) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Nama dan tipe komponen wajib diisi.")}`);
  }
  const componentType = componentTypeRaw as (typeof COMPONENT_TYPES)[number];
  const liabilityAccountId = componentType === "potongan" ? formData.get("liabilityAccountId")?.toString() || null : null;

  await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
    tx
      .update(salaryComponents)
      .set({ name, componentType, liabilityAccountId, updatedAt: new Date() })
      .where(and(eq(salaryComponents.id, salaryComponentId), eq(salaryComponents.companyId, companyId)))
  );

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "update_salary_component",
    entityType: "salary_component",
    entityId: salaryComponentId,
    metadata: { name, componentType },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}
