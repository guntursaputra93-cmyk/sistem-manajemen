import { and, eq, isNotNull, lt, sql } from "drizzle-orm";
import type { db as Db } from "@/lib/db";
import { documentVersions } from "@/drizzle/schema";
import { initializeApprovalSteps, getApprovalStatus, recordApprovalDecision, type ActingUser } from "@/lib/approval/flows";

export class DocumentVersionError extends Error {}

/**
 * Cek expired dilakukan "lazy" saat dibuka (bukan cron job) — sesuai keputusan:
 * dipanggil di awal query listing/detail dokumen, jadi status di database
 * selalu benar begitu ada yang membuka halaman, tanpa perlu infrastruktur
 * terjadwal terpisah.
 */
export async function expireOverdueDocumentVersions(tx: typeof Db, params: { companyId: string }): Promise<void> {
  await tx
    .update(documentVersions)
    .set({ status: "expired" })
    .where(
      and(
        eq(documentVersions.companyId, params.companyId),
        eq(documentVersions.status, "active"),
        isNotNull(documentVersions.expiresAt),
        lt(documentVersions.expiresAt, sql`CURRENT_DATE`)
      )
    );
}

/**
 * Set 1 versi jadi 'active' dan otomatis men-supersede versi 'active'
 * sebelumnya (kalau ada) — atomik karena dijalankan dalam 1 transaksi (`tx`
 * yang sama dari withTenantContext), sesuai spesifikasi Bagian 2.4.
 */
async function activateDocumentVersion(
  tx: typeof Db,
  params: { companyId: string; documentId: string; documentVersionId: string }
): Promise<void> {
  await tx
    .update(documentVersions)
    .set({ status: "superseded" })
    .where(and(eq(documentVersions.documentId, params.documentId), eq(documentVersions.status, "active")));

  await tx
    .update(documentVersions)
    .set({ status: "active" })
    .where(eq(documentVersions.id, params.documentVersionId));
}

/**
 * Ajukan versi draft untuk direview. jenisKey approval_flows dokumen = kode
 * kategori dokumen (lihat documentCategories.ts). Kalau admin belum
 * konfigurasi approval sama sekali (0 jenjang), langsung aktif.
 */
export async function submitDocumentVersionForReview(
  tx: typeof Db,
  params: { companyId: string; documentId: string; documentVersionId: string; categoryCode: string }
): Promise<void> {
  const [version] = await tx.select().from(documentVersions).where(eq(documentVersions.id, params.documentVersionId));
  if (!version) throw new DocumentVersionError("Versi dokumen tidak ditemukan.");
  if (version.status !== "draft") throw new DocumentVersionError("Versi ini bukan draft.");

  await initializeApprovalSteps(tx, {
    companyId: params.companyId,
    entityType: "dokumen",
    entityId: version.id,
    jenisKey: params.categoryCode,
    departmentId: null, // dokumen berlaku company-wide, tidak dimiliki 1 departemen tertentu
  });

  const status = await getApprovalStatus(tx, { entityType: "dokumen", entityId: version.id });

  if (status.allApproved) {
    await activateDocumentVersion(tx, { companyId: params.companyId, documentId: params.documentId, documentVersionId: version.id });
  } else {
    await tx.update(documentVersions).set({ status: "in_review" }).where(eq(documentVersions.id, version.id));
  }
}

/**
 * Approve/reject 1 jenjang. Ditolak -> balik ke 'draft' untuk direvisi (tidak
 * ada status 'ditolak' di document_versions, beda dari outgoing_letters).
 */
export async function decideDocumentVersionApproval(
  tx: typeof Db,
  params: {
    companyId: string;
    documentId: string;
    documentVersionId: string;
    stepOrder: number;
    actingUser: ActingUser;
    decision: "approved" | "rejected";
    catatan?: string | null;
  }
): Promise<void> {
  await recordApprovalDecision(tx, {
    companyId: params.companyId,
    entityType: "dokumen",
    entityId: params.documentVersionId,
    stepOrder: params.stepOrder,
    actingUser: params.actingUser,
    decision: params.decision,
    catatan: params.catatan,
  });

  if (params.decision === "rejected") {
    await tx.update(documentVersions).set({ status: "draft" }).where(eq(documentVersions.id, params.documentVersionId));
    return;
  }

  const status = await getApprovalStatus(tx, { entityType: "dokumen", entityId: params.documentVersionId });
  if (status.allApproved) {
    await activateDocumentVersion(tx, {
      companyId: params.companyId,
      documentId: params.documentId,
      documentVersionId: params.documentVersionId,
    });
  }
}
