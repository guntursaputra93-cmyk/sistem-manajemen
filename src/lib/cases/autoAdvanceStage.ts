import { eq } from "drizzle-orm";
import type { db as Db } from "@/lib/db";
import { cases, caseStageHistory } from "@/drizzle/schema";

// Auto-advance stage APP-LAYER (langkah 1.6 revisi) — BUKAN trigger DB, konsisten
// konvensi "semua logika otomatis app-level" (Fase 3 Bagian 0, lihat reports.ts).
//
// Ordinal urutan maju: intake<penawaran<kontrak<penugasan<pelaksanaan<review<delivery.
// closed & cancelled SENGAJA tidak ada di map ini → advanceCaseStage tidak akan
// pernah menyentuh case yang sudah closed/cancelled (currentOrd undefined -> no-op),
// dan tidak pernah bisa dijadikan target.
const STAGE_ORDINAL: Record<string, number> = {
  intake: 1,
  penawaran: 2,
  kontrak: 3,
  penugasan: 4,
  pelaksanaan: 5,
  review: 6,
  delivery: 7,
};

export type AdvanceableStage =
  | "intake"
  | "penawaran"
  | "kontrak"
  | "penugasan"
  | "pelaksanaan"
  | "review"
  | "delivery";

/**
 * Majukan current_stage sebuah case ke targetStage — HANYA kalau maju (ordinal target
 * lebih besar dari ordinal sekarang). Tidak pernah mundur, tidak pernah menimpa
 * closed/cancelled. Kalau tidak maju (sudah di stage sama/lebih jauh, case tak
 * ditemukan, atau closed/cancelled) → no-op, TIDAK error (itu kondisi normal).
 *
 * Panggil dengan `tx` yang sudah punya tenant context + di dalam transaksi operasi
 * utama pemanggilnya, supaya atomik (kalau operasi utama rollback, advance ikut batal).
 * Return true kalau benar-benar maju, false kalau no-op.
 */
export async function advanceCaseStage(
  tx: typeof Db,
  caseId: string,
  targetStage: AdvanceableStage,
  eventLabel: string
): Promise<boolean> {
  const [row] = await tx
    .select({ companyId: cases.companyId, currentStage: cases.currentStage })
    .from(cases)
    .where(eq(cases.id, caseId));
  if (!row) return false; // case tidak ditemukan (mis. belum ter-link) — bukan error

  const currentOrd = STAGE_ORDINAL[row.currentStage];
  const targetOrd = STAGE_ORDINAL[targetStage];
  // currentOrd undefined => case closed/cancelled -> jangan sentuh.
  // targetOrd undefined => target bukan stage advanceable -> jangan sentuh.
  if (currentOrd === undefined || targetOrd === undefined) return false;
  if (targetOrd <= currentOrd) return false; // hanya maju, tidak pernah mundur/menimpa

  const now = new Date();
  await tx.update(cases).set({ currentStage: targetStage, updatedAt: now }).where(eq(cases.id, caseId));
  await tx.insert(caseStageHistory).values({
    companyId: row.companyId,
    caseId,
    fromStage: row.currentStage,
    toStage: targetStage,
    notes: `Auto-advance: ${eventLabel}`,
    changedBy: null,
    changedAt: now,
  });
  return true;
}
