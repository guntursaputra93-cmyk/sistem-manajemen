import { and, eq, lt, gte, lte, isNotNull, sql } from "drizzle-orm";
import type { db as Db } from "@/lib/db";
import {
  dashboardSettings,
  documentCategories,
  documents,
  documentVersions,
  outgoingLetters,
  documentAccessLogs,
} from "@/drizzle/schema";

export type DashboardThresholds = {
  stalledThresholdDays: number;
  expiryWarningDays: number;
};

const DEFAULT_THRESHOLDS: DashboardThresholds = { stalledThresholdDays: 14, expiryWarningDays: 30 };

export async function getDashboardSettings(tx: typeof Db, companyId: string): Promise<DashboardThresholds> {
  const [row] = await tx.select().from(dashboardSettings).where(eq(dashboardSettings.companyId, companyId));
  if (!row) return DEFAULT_THRESHOLDS;
  return { stalledThresholdDays: row.stalledThresholdDays, expiryWarningDays: row.expiryWarningDays };
}

export type CategoryActiveCount = { categoryId: string; categoryName: string; count: number };

/** Ringkasan jumlah dokumen aktif per kategori (spesifikasi Bagian 4). */
export async function getActiveDocumentCountByCategory(tx: typeof Db, companyId: string): Promise<CategoryActiveCount[]> {
  const rows = await tx
    .select({ categoryId: documentCategories.id, categoryName: documentCategories.name, count: sql<number>`count(${documentVersions.id})::int` })
    .from(documentCategories)
    .leftJoin(documents, eq(documents.categoryId, documentCategories.id))
    .leftJoin(documentVersions, and(eq(documentVersions.documentId, documents.id), eq(documentVersions.status, "active")))
    .where(eq(documentCategories.companyId, companyId))
    .groupBy(documentCategories.id, documentCategories.name);

  return rows;
}

export type AttentionItem = {
  kind: "dokumen" | "surat";
  id: string;
  title: string;
  reason: "in_review_lama" | "menunggu_approval_lama" | "draft_mangkrak" | "mendekati_kedaluwarsa";
  since: Date | string;
};

/**
 * Daftar "butuh perhatian" (spesifikasi Bagian 4) — digabung dari document_versions
 * DAN outgoing_letters, ambang waktunya diambil dari dashboard_settings (admin-configurable).
 */
export async function getAttentionItems(
  tx: typeof Db,
  companyId: string,
  thresholds: DashboardThresholds
): Promise<AttentionItem[]> {
  const stalledCutoff = new Date(Date.now() - thresholds.stalledThresholdDays * 86_400_000);
  const expiryCutoffDate = new Date(Date.now() + thresholds.expiryWarningDays * 86_400_000).toISOString().slice(0, 10);
  const todayDate = new Date().toISOString().slice(0, 10);

  const [stalledReviewDocs, staleDraftDocs, expiringDocs, stalledApprovalLetters, staleDraftLetters] = await Promise.all([
    tx
      .select({ id: documentVersions.id, title: documents.title, since: documentVersions.createdAt })
      .from(documentVersions)
      .innerJoin(documents, eq(documents.id, documentVersions.documentId))
      .where(and(eq(documentVersions.companyId, companyId), eq(documentVersions.status, "in_review"), lt(documentVersions.createdAt, stalledCutoff))),
    tx
      .select({ id: documentVersions.id, title: documents.title, since: documentVersions.createdAt })
      .from(documentVersions)
      .innerJoin(documents, eq(documents.id, documentVersions.documentId))
      .where(and(eq(documentVersions.companyId, companyId), eq(documentVersions.status, "draft"), lt(documentVersions.createdAt, stalledCutoff))),
    tx
      .select({ id: documentVersions.id, title: documents.title, since: documentVersions.expiresAt })
      .from(documentVersions)
      .innerJoin(documents, eq(documents.id, documentVersions.documentId))
      .where(
        and(
          eq(documentVersions.companyId, companyId),
          eq(documentVersions.status, "active"),
          isNotNull(documentVersions.expiresAt),
          gte(documentVersions.expiresAt, todayDate),
          lte(documentVersions.expiresAt, expiryCutoffDate)
        )
      ),
    tx
      .select({ id: outgoingLetters.id, title: outgoingLetters.subject, since: outgoingLetters.createdAt })
      .from(outgoingLetters)
      .where(and(eq(outgoingLetters.companyId, companyId), eq(outgoingLetters.status, "menunggu_approval"), lt(outgoingLetters.createdAt, stalledCutoff))),
    tx
      .select({ id: outgoingLetters.id, title: outgoingLetters.subject, since: outgoingLetters.createdAt })
      .from(outgoingLetters)
      .where(and(eq(outgoingLetters.companyId, companyId), eq(outgoingLetters.status, "draft"), lt(outgoingLetters.createdAt, stalledCutoff))),
  ]);

  return [
    ...stalledReviewDocs.map((r) => ({ kind: "dokumen" as const, id: r.id, title: r.title, reason: "in_review_lama" as const, since: r.since })),
    ...staleDraftDocs.map((r) => ({ kind: "dokumen" as const, id: r.id, title: r.title, reason: "draft_mangkrak" as const, since: r.since })),
    ...expiringDocs.map((r) => ({ kind: "dokumen" as const, id: r.id, title: r.title, reason: "mendekati_kedaluwarsa" as const, since: r.since ?? "" })),
    ...stalledApprovalLetters.map((r) => ({ kind: "surat" as const, id: r.id, title: r.title, reason: "menunggu_approval_lama" as const, since: r.since })),
    ...staleDraftLetters.map((r) => ({ kind: "surat" as const, id: r.id, title: r.title, reason: "draft_mangkrak" as const, since: r.since })),
  ];
}

export type AccessStat = { documentVersionId: string; title: string; viewCount: number };

/** Statistik akses: dokumen paling sering/jarang dibaca (spesifikasi Bagian 4). */
export async function getAccessStatistics(tx: typeof Db, companyId: string): Promise<{ mostRead: AccessStat[]; leastRead: AccessStat[] }> {
  const rows = await tx
    .select({
      documentVersionId: documentVersions.id,
      title: documents.title,
      viewCount: sql<number>`count(${documentAccessLogs.id}) filter (where ${documentAccessLogs.action} = 'view')::int`,
    })
    .from(documentVersions)
    .innerJoin(documents, eq(documents.id, documentVersions.documentId))
    .leftJoin(documentAccessLogs, eq(documentAccessLogs.documentVersionId, documentVersions.id))
    .where(eq(documentVersions.companyId, companyId))
    .groupBy(documentVersions.id, documents.title);

  const sorted = [...rows].sort((a, b) => b.viewCount - a.viewCount);
  return { mostRead: sorted.slice(0, 5), leastRead: [...sorted].reverse().slice(0, 5) };
}
