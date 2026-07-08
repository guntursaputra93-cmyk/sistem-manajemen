"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, documents, documentVersions, documentCategories, users } from "@/drizzle/schema";
import { hasPermission, type Role } from "@/lib/rbac/permissions";
import { logAudit } from "@/lib/audit/log";
import { submitDocumentVersionForReview, decideDocumentVersionApproval, DocumentVersionError } from "@/lib/documents/versions";

export async function createDocument(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const redirectBase = `/${companySlug}/dokumen`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "CREATE_DOCUMENT")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin membuat dokumen.")}`);
  }

  const title = formData.get("title")?.toString().trim() ?? "";
  const categoryId = formData.get("categoryId")?.toString() ?? "";
  const effectiveDate = formData.get("effectiveDate")?.toString() || null;
  const expiresAt = formData.get("expiresAt")?.toString() || null;

  if (!title || !categoryId) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Judul dan kategori wajib diisi.")}`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };
  const [company] = await withTenantContext(tenantContext, (tx) => tx.select().from(companies).where(eq(companies.slug, companySlug)));
  if (!company) redirect(`${redirectBase}?error=${encodeURIComponent("Perusahaan tidak ditemukan.")}`);

  const documentId = await withTenantContext(tenantContext, async (tx) => {
    const [doc] = await tx.insert(documents).values({ companyId: company.id, categoryId, title }).returning();
    await tx.insert(documentVersions).values({
      companyId: company.id,
      documentId: doc.id,
      versionNumber: 1,
      status: "draft",
      effectiveDate,
      expiresAt,
      createdBy: session.user.id,
    });
    return doc.id;
  });

  await logAudit({
    companyId: company.id,
    userId: session.user.id,
    action: "create_document",
    entityType: "document",
    entityId: documentId,
    metadata: { title, categoryId },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}/${documentId}?success=1`);
}

export async function addNewVersion(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const documentId = formData.get("documentId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/dokumen/${documentId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "CREATE_DOCUMENT")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin menambah versi.")}`);
  }

  const effectiveDate = formData.get("effectiveDate")?.toString() || null;
  const expiresAt = formData.get("expiresAt")?.toString() || null;

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };
  const [company] = await withTenantContext(tenantContext, (tx) => tx.select().from(companies).where(eq(companies.slug, companySlug)));
  if (!company) redirect(`${redirectBase}?error=${encodeURIComponent("Perusahaan tidak ditemukan.")}`);

  await withTenantContext(tenantContext, async (tx) => {
    const [lastVersion] = await tx
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.documentId, documentId))
      .orderBy(desc(documentVersions.versionNumber))
      .limit(1);
    const nextVersionNumber = (lastVersion?.versionNumber ?? 0) + 1;

    await tx.insert(documentVersions).values({
      companyId: company.id,
      documentId,
      versionNumber: nextVersionNumber,
      status: "draft",
      effectiveDate,
      expiresAt,
      createdBy: session.user.id,
    });
  });

  await logAudit({
    companyId: company.id,
    userId: session.user.id,
    action: "create_document_version",
    entityType: "document",
    entityId: documentId,
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function submitVersionForReviewAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const documentId = formData.get("documentId")?.toString() ?? "";
  const versionId = formData.get("versionId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/dokumen/${documentId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "CREATE_DOCUMENT")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengajukan review.")}`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };
  const [company] = await withTenantContext(tenantContext, (tx) => tx.select().from(companies).where(eq(companies.slug, companySlug)));
  if (!company) redirect(`${redirectBase}?error=${encodeURIComponent("Perusahaan tidak ditemukan.")}`);

  try {
    await withTenantContext(tenantContext, async (tx) => {
      const [doc] = await tx.select().from(documents).where(eq(documents.id, documentId));
      const [category] = await tx.select().from(documentCategories).where(eq(documentCategories.id, doc.categoryId));
      await submitDocumentVersionForReview(tx, {
        companyId: company.id,
        documentId,
        documentVersionId: versionId,
        categoryCode: category.code,
      });
    });
  } catch (err) {
    if (err instanceof DocumentVersionError) {
      redirect(`${redirectBase}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  await logAudit({
    companyId: company.id,
    userId: session.user.id,
    action: "submit_document_version_for_review",
    entityType: "document_version",
    entityId: versionId,
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function decideVersionApprovalAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const documentId = formData.get("documentId")?.toString() ?? "";
  const versionId = formData.get("versionId")?.toString() ?? "";
  const stepOrder = Number.parseInt(formData.get("stepOrder")?.toString() ?? "", 10);
  const decision = formData.get("decision")?.toString() as "approved" | "rejected";
  const catatan = formData.get("catatan")?.toString().trim() || null;
  const redirectBase = `/${companySlug}/dokumen/${documentId}`;

  const session = await auth();
  if (!session?.user) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Sesi tidak valid.")}`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };
  const [company] = await withTenantContext(tenantContext, (tx) => tx.select().from(companies).where(eq(companies.slug, companySlug)));
  if (!company) redirect(`${redirectBase}?error=${encodeURIComponent("Perusahaan tidak ditemukan.")}`);

  try {
    await withTenantContext(tenantContext, async (tx) => {
      const [actingUser] = await tx.select().from(users).where(eq(users.id, session.user.id));
      await decideDocumentVersionApproval(tx, {
        companyId: company.id,
        documentId,
        documentVersionId: versionId,
        stepOrder,
        actingUser: { id: session.user.id, role: session.user.role as Role, departmentId: actingUser?.departmentId ?? null },
        decision,
        catatan,
      });
    });
  } catch (err) {
    if (err instanceof Error) {
      redirect(`${redirectBase}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  await logAudit({
    companyId: company.id,
    userId: session.user.id,
    action: decision === "approved" ? "approve_document_version_step" : "reject_document_version_step",
    entityType: "document_version",
    entityId: versionId,
    metadata: { stepOrder, catatan },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}
