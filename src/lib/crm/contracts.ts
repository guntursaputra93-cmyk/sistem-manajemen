import { and, eq } from "drizzle-orm";
import type { db as Db } from "@/lib/db";
import { contracts } from "@/drizzle/schema";

export class ContractError extends Error {}

/**
 * Dipanggil dari changeOpportunityStage saat opportunity pindah ke tahap
 * is_won_stage=true (keputusan eksekusi CRM Langkah 5: otomatis, bukan prompt
 * konfirmasi). Idempoten — kalau opportunity ini pernah "menang" sebelumnya
 * dan sudah punya contract, tidak dibuat duplikat.
 */
export async function createContractIfMissing(
  tx: typeof Db,
  params: { companyId: string; opportunityId: string; organizationId: string; contractValue: string | null; startDate: Date }
): Promise<{ created: boolean; id?: string }> {
  const existing = await tx.select().from(contracts).where(and(eq(contracts.opportunityId, params.opportunityId), eq(contracts.companyId, params.companyId)));
  if (existing.length > 0) return { created: false };

  const [contract] = await tx
    .insert(contracts)
    .values({
      companyId: params.companyId,
      opportunityId: params.opportunityId,
      organizationId: params.organizationId,
      // Kontrak tanpa nilai (estimated_value opportunity kosong) tidak valid — fallback ke "0" spy tetap tercatat, diedit manual.
      contractValue: params.contractValue ?? "0",
      startDate: params.startDate.toISOString().slice(0, 10),
    })
    .returning();

  return { created: true, id: contract.id };
}

export async function updateContract(
  tx: typeof Db,
  params: {
    companyId: string;
    contractId: string;
    contractValue: string;
    startDate: string;
    endDate: string | null;
    paymentStatus: "belum_dibayar" | "sebagian" | "lunas";
    renewalReminderDate: string | null;
  }
): Promise<void> {
  const [existing] = await tx.select().from(contracts).where(and(eq(contracts.id, params.contractId), eq(contracts.companyId, params.companyId)));
  if (!existing) throw new ContractError("Contract tidak ditemukan.");

  await tx
    .update(contracts)
    .set({
      contractValue: params.contractValue,
      startDate: params.startDate,
      endDate: params.endDate,
      paymentStatus: params.paymentStatus,
      renewalReminderDate: params.renewalReminderDate,
    })
    .where(eq(contracts.id, params.contractId));
}
