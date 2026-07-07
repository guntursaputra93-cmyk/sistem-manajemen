"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { documentCategories } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { logAudit } from "@/lib/audit/log";

export async function addDocumentCategory(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const redirectBase = `/${companySlug}/pengaturan/kategori-dokumen`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_DOCUMENT_CATEGORIES")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengatur kategori dokumen.")}`);
  }

  const code = formData.get("code")?.toString().trim().toUpperCase() ?? "";
  const name = formData.get("name")?.toString().trim() ?? "";
  const hierarchyLevel = Number.parseInt(formData.get("hierarchyLevel")?.toString() ?? "", 10);

  if (!code || !name) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Kode dan nama kategori wajib diisi.")}`);
  }
  if (!Number.isInteger(hierarchyLevel) || hierarchyLevel < 1) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Hierarchy level harus angka >= 1.")}`);
  }

  try {
    await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      tx.insert(documentCategories).values({ companyId: session.user.companyId, code, name, hierarchyLevel })
    );
  } catch {
    redirect(`${redirectBase}?error=${encodeURIComponent("Kode kategori ini sudah ada.")}`);
  }

  await logAudit({
    companyId: session.user.companyId,
    userId: session.user.id,
    action: "create_document_category",
    entityType: "document_category",
    metadata: { code, name, hierarchyLevel },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function deleteDocumentCategory(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const id = formData.get("id")?.toString() ?? "";
  const redirectBase = `/${companySlug}/pengaturan/kategori-dokumen`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_DOCUMENT_CATEGORIES")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengatur kategori dokumen.")}`);
  }

  try {
    await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      tx.delete(documentCategories).where(and(eq(documentCategories.id, id), eq(documentCategories.companyId, session.user.companyId)))
    );
  } catch {
    redirect(`${redirectBase}?error=${encodeURIComponent("Kategori ini masih dipakai dokumen — tidak bisa dihapus.")}`);
  }

  await logAudit({
    companyId: session.user.companyId,
    userId: session.user.id,
    action: "delete_document_category",
    entityType: "document_category",
    entityId: id,
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}
