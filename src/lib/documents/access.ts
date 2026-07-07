import { and, eq, isNull } from "drizzle-orm";
import type { db as Db } from "@/lib/db";
import { documentAccessRules, documentAccessLogs, documentCategories, documents, documentVersions } from "@/drizzle/schema";
import type { Role } from "@/lib/rbac/permissions";

export type DocumentViewer = {
  role: Role;
  departmentId: string | null;
};

/**
 * DEFAULT FAIL-OPEN (spesifikasi Bagian 2.4): tidak ada rule sama sekali untuk
 * dokumen/kategori ini -> SEMUA staf company bisa lihat. Rule spesifik per
 * dokumen (document_id) MENIMPA rule per kategori kalau ada (override).
 * super_admin/company_admin selalu bisa lihat (butuh akses penuh utk mengelola).
 */
export async function canViewDocument(
  tx: typeof Db,
  params: { companyId: string; documentId: string; categoryId: string; viewer: DocumentViewer }
): Promise<boolean> {
  if (params.viewer.role === "super_admin" || params.viewer.role === "company_admin") return true;

  const documentSpecificRules = await tx
    .select()
    .from(documentAccessRules)
    .where(and(eq(documentAccessRules.companyId, params.companyId), eq(documentAccessRules.documentId, params.documentId)));

  const applicableRules =
    documentSpecificRules.length > 0
      ? documentSpecificRules
      : await tx
          .select()
          .from(documentAccessRules)
          .where(
            and(
              eq(documentAccessRules.companyId, params.companyId),
              eq(documentAccessRules.documentCategoryId, params.categoryId),
              isNull(documentAccessRules.documentId)
            )
          );

  if (applicableRules.length === 0) return true; // fail-open

  return applicableRules.some((rule) => {
    if (rule.scope === "semua_staf") return true;
    if (rule.scope === "departemen_tertentu") return params.viewer.departmentId !== null && params.viewer.departmentId === rule.departmentId;
    if (rule.scope === "role_tertentu") return params.viewer.role === rule.role;
    return false;
  });
}

export async function logDocumentAccess(
  tx: typeof Db,
  params: { companyId: string; documentVersionId: string; userId: string; action: "view" | "download" }
): Promise<void> {
  await tx.insert(documentAccessLogs).values({
    companyId: params.companyId,
    documentVersionId: params.documentVersionId,
    userId: params.userId,
    action: params.action,
  });
}

export async function hasUserViewedVersion(
  tx: typeof Db,
  params: { userId: string; documentVersionId: string }
): Promise<boolean> {
  const [row] = await tx
    .select()
    .from(documentAccessLogs)
    .where(
      and(
        eq(documentAccessLogs.userId, params.userId),
        eq(documentAccessLogs.documentVersionId, params.documentVersionId),
        eq(documentAccessLogs.action, "view")
      )
    )
    .limit(1);
  return Boolean(row);
}

/**
 * Badge notifikasi belum dibaca per tab (spesifikasi Bagian 4): dokumen dianggap
 * belum dibaca kalau (a) lolos document_access_rules untuk user ini, DAN
 * (b) belum ada baris document_access_logs (action='view') dari user ini
 * untuk document_version aktifnya. Dihitung langsung dari 2 tabel yang sudah
 * ada, bukan tabel status terpisah yang perlu disinkronkan manual.
 */
export async function getUnreadDocumentCount(
  tx: typeof Db,
  params: { companyId: string; hierarchyLevel: number; userId: string; viewer: DocumentViewer }
): Promise<number> {
  const categories = await tx
    .select()
    .from(documentCategories)
    .where(and(eq(documentCategories.companyId, params.companyId), eq(documentCategories.hierarchyLevel, params.hierarchyLevel)));
  const categoryIds = new Set(categories.map((c) => c.id));

  const allDocs = await tx.select().from(documents).where(eq(documents.companyId, params.companyId));
  const docsInLevel = allDocs.filter((d) => categoryIds.has(d.categoryId));

  const allVersions = await tx.select().from(documentVersions).where(eq(documentVersions.companyId, params.companyId));
  const activeVersionByDoc = new Map(allVersions.filter((v) => v.status === "active").map((v) => [v.documentId, v]));

  const viewedLogs = await tx
    .select()
    .from(documentAccessLogs)
    .where(and(eq(documentAccessLogs.userId, params.userId), eq(documentAccessLogs.action, "view")));
  const viewedVersionIds = new Set(viewedLogs.map((l) => l.documentVersionId));

  let unread = 0;
  for (const doc of docsInLevel) {
    const activeVersion = activeVersionByDoc.get(doc.id);
    if (!activeVersion) continue; // belum ada versi aktif -> belum ada yang bisa "dibaca"
    const visible = await canViewDocument(tx, { companyId: params.companyId, documentId: doc.id, categoryId: doc.categoryId, viewer: params.viewer });
    if (visible && !viewedVersionIds.has(activeVersion.id)) unread++;
  }
  return unread;
}
