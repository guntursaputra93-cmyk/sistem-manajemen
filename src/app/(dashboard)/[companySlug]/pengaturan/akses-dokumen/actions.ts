"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, documentAccessRules } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { logAudit } from "@/lib/audit/log";

const SCOPE_VALUES = ["semua_staf", "departemen_tertentu", "role_tertentu"] as const;
const ROLE_VALUES = ["super_admin", "company_admin", "department_head", "staff"] as const;

export async function addDocumentAccessRule(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const redirectBase = `/${companySlug}/pengaturan/akses-dokumen`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_DOCUMENT_ACCESS_RULES")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengatur jenjang akses dokumen.")}`);
  }

  const targetMode = formData.get("targetMode")?.toString() ?? "";
  const documentCategoryId = formData.get("documentCategoryId")?.toString() || null;
  const documentId = formData.get("documentId")?.toString() || null;
  const scope = formData.get("scope")?.toString() ?? "";
  const departmentId = formData.get("departmentId")?.toString() || null;
  const role = formData.get("role")?.toString() || null;

  if (targetMode !== "category" && targetMode !== "document") {
    redirect(`${redirectBase}?error=${encodeURIComponent("Pilih target: kategori atau dokumen spesifik.")}`);
  }
  if (targetMode === "category" && !documentCategoryId) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Pilih kategori dokumen.")}`);
  }
  if (targetMode === "document" && !documentId) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Pilih dokumen spesifik.")}`);
  }
  if (!SCOPE_VALUES.includes(scope as (typeof SCOPE_VALUES)[number])) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Scope tidak valid.")}`);
  }
  if (scope === "departemen_tertentu" && !departmentId) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Pilih departemen untuk scope departemen tertentu.")}`);
  }
  if (scope === "role_tertentu" && !role) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Pilih role untuk scope role tertentu.")}`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };
  const [company] = await withTenantContext(tenantContext, (tx) => tx.select().from(companies).where(eq(companies.slug, companySlug)));
  if (!company) redirect(`${redirectBase}?error=${encodeURIComponent("Perusahaan tidak ditemukan.")}`);

  try {
    await withTenantContext(tenantContext, (tx) =>
      tx.insert(documentAccessRules).values({
        companyId: company.id,
        documentCategoryId: targetMode === "category" ? documentCategoryId : null,
        documentId: targetMode === "document" ? documentId : null,
        scope: scope as (typeof SCOPE_VALUES)[number],
        departmentId: scope === "departemen_tertentu" ? departmentId : null,
        role: scope === "role_tertentu" ? (role as (typeof ROLE_VALUES)[number]) : null,
      })
    );
  } catch {
    redirect(`${redirectBase}?error=${encodeURIComponent("Gagal menyimpan rule akses.")}`);
  }

  await logAudit({
    companyId: company.id,
    userId: session.user.id,
    action: "create_document_access_rule",
    entityType: "document_access_rule",
    metadata: { targetMode, documentCategoryId, documentId, scope, departmentId, role },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function deleteDocumentAccessRule(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const id = formData.get("id")?.toString() ?? "";
  const redirectBase = `/${companySlug}/pengaturan/akses-dokumen`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_DOCUMENT_ACCESS_RULES")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengatur jenjang akses dokumen.")}`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };
  const [company] = await withTenantContext(tenantContext, (tx) => tx.select().from(companies).where(eq(companies.slug, companySlug)));
  if (!company) redirect(`${redirectBase}?error=${encodeURIComponent("Perusahaan tidak ditemukan.")}`);

  await withTenantContext(tenantContext, (tx) =>
    tx.delete(documentAccessRules).where(and(eq(documentAccessRules.id, id), eq(documentAccessRules.companyId, company.id)))
  );

  await logAudit({
    companyId: company.id,
    userId: session.user.id,
    action: "delete_document_access_rule",
    entityType: "document_access_rule",
    entityId: id,
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}
