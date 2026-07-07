import { and, eq } from "drizzle-orm";
import type { db as Db } from "@/lib/db";
import { proposalItems, opportunities } from "@/drizzle/schema";

export class ProposalItemError extends Error {}

function computeSubtotal(quantity: string, unitPrice: string): string {
  return (Number(quantity) * Number(unitPrice)).toFixed(2);
}

/**
 * Total nilai proposal = jumlah subtotal seluruh proposal_items utk 1
 * outgoing_letter_id (spesifikasi CRM Bagian 2.3) — dipakai jg utk sinkron
 * otomatis ke opportunities.estimated_value tiap kali item berubah.
 */
async function syncEstimatedValueForLetter(tx: typeof Db, params: { companyId: string; outgoingLetterId: string }): Promise<void> {
  const items = await tx
    .select()
    .from(proposalItems)
    .where(and(eq(proposalItems.companyId, params.companyId), eq(proposalItems.outgoingLetterId, params.outgoingLetterId)));

  const opportunityId = items.find((i) => i.opportunityId)?.opportunityId;
  if (!opportunityId) return;

  const total = items.reduce((sum, i) => sum + Number(i.subtotal), 0);
  await tx
    .update(opportunities)
    .set({ estimatedValue: total.toFixed(2), updatedAt: new Date() })
    .where(and(eq(opportunities.id, opportunityId), eq(opportunities.companyId, params.companyId)));
}

export async function createProposalItem(
  tx: typeof Db,
  params: {
    companyId: string;
    outgoingLetterId: string;
    opportunityId: string | null;
    itemName: string;
    quantity: string;
    unit: string;
    unitPrice: string;
    notes: string | null;
  }
): Promise<{ id: string }> {
  const subtotal = computeSubtotal(params.quantity, params.unitPrice);

  const [item] = await tx
    .insert(proposalItems)
    .values({
      companyId: params.companyId,
      outgoingLetterId: params.outgoingLetterId,
      opportunityId: params.opportunityId,
      itemName: params.itemName,
      quantity: params.quantity,
      unit: params.unit,
      unitPrice: params.unitPrice,
      subtotal,
      notes: params.notes,
    })
    .returning();

  await syncEstimatedValueForLetter(tx, { companyId: params.companyId, outgoingLetterId: params.outgoingLetterId });

  return { id: item.id };
}

export async function updateProposalItem(
  tx: typeof Db,
  params: {
    companyId: string;
    itemId: string;
    itemName: string;
    quantity: string;
    unit: string;
    unitPrice: string;
    notes: string | null;
  }
): Promise<void> {
  const [existing] = await tx.select().from(proposalItems).where(and(eq(proposalItems.id, params.itemId), eq(proposalItems.companyId, params.companyId)));
  if (!existing) throw new ProposalItemError("Item proposal tidak ditemukan.");

  const subtotal = computeSubtotal(params.quantity, params.unitPrice);

  await tx
    .update(proposalItems)
    .set({ itemName: params.itemName, quantity: params.quantity, unit: params.unit, unitPrice: params.unitPrice, subtotal, notes: params.notes })
    .where(eq(proposalItems.id, params.itemId));

  await syncEstimatedValueForLetter(tx, { companyId: params.companyId, outgoingLetterId: existing.outgoingLetterId });
}

export async function deleteProposalItem(tx: typeof Db, params: { companyId: string; itemId: string }): Promise<void> {
  const [existing] = await tx.select().from(proposalItems).where(and(eq(proposalItems.id, params.itemId), eq(proposalItems.companyId, params.companyId)));
  if (!existing) throw new ProposalItemError("Item proposal tidak ditemukan.");

  await tx.delete(proposalItems).where(eq(proposalItems.id, params.itemId));

  await syncEstimatedValueForLetter(tx, { companyId: params.companyId, outgoingLetterId: existing.outgoingLetterId });
}
