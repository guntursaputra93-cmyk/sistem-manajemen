import { and, eq } from "drizzle-orm";
import type { db as Db } from "@/lib/db";
import { opportunities, opportunityStageHistory, pipelineStages, users } from "@/drizzle/schema";
import type { Role } from "@/lib/rbac/permissions";
import { createContractIfMissing } from "@/lib/crm/contracts";

export class OpportunityError extends Error {}

export type OpportunityViewer = {
  userId: string;
  role: Role;
  departmentId: string | null;
};

/**
 * staff cuma lihat opportunity miliknya sendiri; department_head lihat semua
 * staf di departemennya; company_admin/super_admin lihat semua (spesifikasi
 * CRM Bagian 4) — ditegakkan di sini, bukan RLS, karena aturannya soal
 * assigned_to/departemen, bukan company_id.
 */
export async function getVisibleAssigneeIds(tx: typeof Db, params: { companyId: string; viewer: OpportunityViewer }): Promise<string[] | null> {
  if (params.viewer.role === "company_admin" || params.viewer.role === "super_admin") return null; // null = tanpa filter
  if (params.viewer.role === "staff") return [params.viewer.userId];

  // department_head: semua staf di departemen yang sama (termasuk dirinya sendiri).
  if (!params.viewer.departmentId) return [params.viewer.userId];
  const deptUsers = await tx.select().from(users).where(and(eq(users.companyId, params.companyId), eq(users.departmentId, params.viewer.departmentId)));
  return deptUsers.map((u) => u.id);
}

/** Wajib minimal 1 won-stage & 1 lost-stage sebelum bisa buat opportunity (spesifikasi CRM Langkah 3). */
async function assertPipelineReady(tx: typeof Db, companyId: string): Promise<void> {
  const stages = await tx.select().from(pipelineStages).where(eq(pipelineStages.companyId, companyId));
  if (!stages.some((s) => s.isWonStage) || !stages.some((s) => s.isLostStage)) {
    throw new OpportunityError("Atur dulu tahap pipeline (minimal 1 tahap 'menang' dan 1 'hilang') sebelum bisa membuat opportunity.");
  }
}

export async function createOpportunity(
  tx: typeof Db,
  params: {
    companyId: string;
    organizationId: string;
    title: string;
    currentStageId: string;
    estimatedValue: string | null;
    expectedCloseDate: string | null;
    assignedTo: string;
    actingUserId: string;
  }
): Promise<{ id: string; contractCreatedId?: string }> {
  await assertPipelineReady(tx, params.companyId);

  const [stage] = await tx.select().from(pipelineStages).where(and(eq(pipelineStages.id, params.currentStageId), eq(pipelineStages.companyId, params.companyId)));
  if (!stage) throw new OpportunityError("Tahap pipeline tidak ditemukan.");

  const status = stage.isWonStage ? "won" : stage.isLostStage ? "lost" : "open";

  const [opp] = await tx
    .insert(opportunities)
    .values({
      companyId: params.companyId,
      organizationId: params.organizationId,
      title: params.title,
      currentStageId: params.currentStageId,
      estimatedValue: params.estimatedValue,
      expectedCloseDate: params.expectedCloseDate,
      assignedTo: params.assignedTo,
      status,
    })
    .returning();

  await tx.insert(opportunityStageHistory).values({
    companyId: params.companyId,
    opportunityId: opp.id,
    stageId: params.currentStageId,
    changedBy: params.actingUserId,
  });

  let contractCreatedId: string | undefined;
  if (status === "won") {
    const result = await createContractIfMissing(tx, {
      companyId: params.companyId,
      opportunityId: opp.id,
      organizationId: params.organizationId,
      contractValue: params.estimatedValue,
      startDate: new Date(),
    });
    contractCreatedId = result.id;
  }

  return { id: opp.id, contractCreatedId };
}

/** Perpindahan tahap bebas (bukan berjenjang wajib berurutan seperti approval_flows) — CRM pipeline lazimnya kanban. */
export async function changeOpportunityStage(
  tx: typeof Db,
  params: { companyId: string; opportunityId: string; newStageId: string; actingUserId: string; lostReason?: string | null }
): Promise<{ contractCreatedId?: string }> {
  const [opp] = await tx.select().from(opportunities).where(and(eq(opportunities.id, params.opportunityId), eq(opportunities.companyId, params.companyId)));
  if (!opp) throw new OpportunityError("Opportunity tidak ditemukan.");

  const [newStage] = await tx.select().from(pipelineStages).where(and(eq(pipelineStages.id, params.newStageId), eq(pipelineStages.companyId, params.companyId)));
  if (!newStage) throw new OpportunityError("Tahap pipeline tidak ditemukan.");

  const now = new Date();

  // Tutup baris riwayat tahap sebelumnya (exited_at) — cari baris terbuka (exited_at null) untuk stage saat ini.
  const openHistoryRows = await tx
    .select()
    .from(opportunityStageHistory)
    .where(and(eq(opportunityStageHistory.opportunityId, params.opportunityId), eq(opportunityStageHistory.stageId, opp.currentStageId)));
  const openRow = openHistoryRows.find((r) => r.exitedAt === null);
  if (openRow) {
    await tx.update(opportunityStageHistory).set({ exitedAt: now }).where(eq(opportunityStageHistory.id, openRow.id));
  }

  await tx.insert(opportunityStageHistory).values({
    companyId: params.companyId,
    opportunityId: params.opportunityId,
    stageId: params.newStageId,
    enteredAt: now,
    changedBy: params.actingUserId,
  });

  const status = newStage.isWonStage ? "won" : newStage.isLostStage ? "lost" : "open";

  await tx
    .update(opportunities)
    .set({
      currentStageId: params.newStageId,
      status,
      lostReason: newStage.isLostStage ? (params.lostReason ?? null) : null,
      updatedAt: now,
    })
    .where(eq(opportunities.id, params.opportunityId));

  if (status === "won") {
    const result = await createContractIfMissing(tx, {
      companyId: params.companyId,
      opportunityId: opp.id,
      organizationId: opp.organizationId,
      contractValue: opp.estimatedValue,
      startDate: now,
    });
    return { contractCreatedId: result.id };
  }

  return {};
}

export async function reassignOpportunity(
  tx: typeof Db,
  params: { companyId: string; opportunityId: string; newAssignedTo: string }
): Promise<void> {
  await tx
    .update(opportunities)
    .set({ assignedTo: params.newAssignedTo, updatedAt: new Date() })
    .where(and(eq(opportunities.id, params.opportunityId), eq(opportunities.companyId, params.companyId)));
}
