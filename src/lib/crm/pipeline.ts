import { and, asc, eq, ne } from "drizzle-orm";
import type { db as Db } from "@/lib/db";
import { pipelineStages } from "@/drizzle/schema";

export class PipelineStageError extends Error {}

export async function getPipelineStages(tx: typeof Db, companyId: string) {
  return tx.select().from(pipelineStages).where(eq(pipelineStages.companyId, companyId)).orderBy(asc(pipelineStages.stageOrder));
}

/**
 * Wajib minimal 1 tahap is_won_stage dan 1 is_lost_stage per company untuk
 * validitas laporan (spesifikasi CRM Bagian 2.2) — dicek di aplikasi karena
 * aturannya lintas-baris (company-wide), bukan sesuatu yang bisa ditulis
 * sebagai CHECK constraint pada 1 baris saja.
 */
async function assertStageCoverageAfterChange(
  tx: typeof Db,
  params: { companyId: string; excludeStageId?: string; wonStageRemoved: boolean; lostStageRemoved: boolean }
): Promise<void> {
  if (!params.wonStageRemoved && !params.lostStageRemoved) return;

  const others = params.excludeStageId
    ? await tx.select().from(pipelineStages).where(and(eq(pipelineStages.companyId, params.companyId), ne(pipelineStages.id, params.excludeStageId)))
    : await tx.select().from(pipelineStages).where(eq(pipelineStages.companyId, params.companyId));

  if (params.wonStageRemoved && !others.some((s) => s.isWonStage)) {
    throw new PipelineStageError("Perusahaan harus punya minimal 1 tahap 'menang' — tidak bisa dihapus/diubah.");
  }
  if (params.lostStageRemoved && !others.some((s) => s.isLostStage)) {
    throw new PipelineStageError("Perusahaan harus punya minimal 1 tahap 'hilang' — tidak bisa dihapus/diubah.");
  }
}

export async function deletePipelineStage(tx: typeof Db, params: { companyId: string; stageId: string }): Promise<void> {
  const [stage] = await tx.select().from(pipelineStages).where(and(eq(pipelineStages.id, params.stageId), eq(pipelineStages.companyId, params.companyId)));
  if (!stage) throw new PipelineStageError("Tahap tidak ditemukan.");

  await assertStageCoverageAfterChange(tx, {
    companyId: params.companyId,
    excludeStageId: params.stageId,
    wonStageRemoved: stage.isWonStage,
    lostStageRemoved: stage.isLostStage,
  });

  await tx.delete(pipelineStages).where(and(eq(pipelineStages.id, params.stageId), eq(pipelineStages.companyId, params.companyId)));
}

export async function updatePipelineStageFlags(
  tx: typeof Db,
  params: { companyId: string; stageId: string; isWonStage: boolean; isLostStage: boolean }
): Promise<void> {
  const [stage] = await tx.select().from(pipelineStages).where(and(eq(pipelineStages.id, params.stageId), eq(pipelineStages.companyId, params.companyId)));
  if (!stage) throw new PipelineStageError("Tahap tidak ditemukan.");

  await assertStageCoverageAfterChange(tx, {
    companyId: params.companyId,
    excludeStageId: params.stageId,
    wonStageRemoved: stage.isWonStage && !params.isWonStage,
    lostStageRemoved: stage.isLostStage && !params.isLostStage,
  });
}
