import { and, eq, ne, sql } from "drizzle-orm";
import type { db as Db } from "@/lib/db";
import { contracts, arInvoices, hppProjectCosts } from "@/drizzle/schema";

type Contract = typeof contracts.$inferSelect;

export type ProjectMarginRow = {
  contract: Contract;
  /** Total ar_invoices.amount yang sudah diposting (status != draft) untuk kontrak ini. */
  totalInvoiced: number;
  /** Total hpp_project_costs.amount untuk kontrak ini. */
  totalHpp: number;
  /** contractValue (nilai kontrak dari CRM) - totalHpp — metrik margin utama (spesifikasi Fase 3 Langkah 5: "nilai kontrak/AR dikurangi total HPP"). */
  marginByContractValue: number;
  /** totalInvoiced (AR yang benar-benar sudah ditagih) - totalHpp — pembanding, berguna kalau baru sebagian kontrak yang di-invoice. */
  marginByInvoiced: number;
};

/**
 * Margin proyek = nilai kontrak/AR dikurangi total HPP per contract_id (Fase 3
 * Langkah 5). Ditampilkan 2 varian margin: berdasar contractValue (nilai kontrak
 * penuh dari CRM, metrik utama) dan berdasar totalInvoiced (AR yang sudah benar-benar
 * ditagih — berguna kalau kontrak baru di-invoice sebagian, contractValue penuh akan
 * terasa terlalu optimis dibanding realisasi tagihan).
 */
export async function getProjectMarginList(tx: typeof Db, params: { companyId: string }): Promise<ProjectMarginRow[]> {
  const contractList = await tx.select().from(contracts).where(eq(contracts.companyId, params.companyId));

  const invoiceTotals = await tx
    .select({ contractId: arInvoices.contractId, total: sql<string>`sum(${arInvoices.amount})` })
    .from(arInvoices)
    .where(and(eq(arInvoices.companyId, params.companyId), ne(arInvoices.status, "draft")))
    .groupBy(arInvoices.contractId);
  const hppTotals = await tx
    .select({ contractId: hppProjectCosts.contractId, total: sql<string>`sum(${hppProjectCosts.amount})` })
    .from(hppProjectCosts)
    .where(eq(hppProjectCosts.companyId, params.companyId))
    .groupBy(hppProjectCosts.contractId);

  const invoiceMap = new Map(invoiceTotals.map((r) => [r.contractId, Number(r.total)]));
  const hppMap = new Map(hppTotals.map((r) => [r.contractId, Number(r.total)]));

  return contractList.map((contract) => {
    const totalInvoiced = invoiceMap.get(contract.id) ?? 0;
    const totalHpp = hppMap.get(contract.id) ?? 0;
    return {
      contract,
      totalInvoiced,
      totalHpp,
      marginByContractValue: Number(contract.contractValue) - totalHpp,
      marginByInvoiced: totalInvoiced - totalHpp,
    };
  });
}
