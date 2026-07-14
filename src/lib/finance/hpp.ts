import { and, eq } from "drizzle-orm";
import type { db as Db } from "@/lib/db";
import { hppProjectCosts, chartOfAccounts, journalEntries, journalEntryLines, contracts } from "@/drizzle/schema";
import { postJournalEntry } from "./journal";

export class HppError extends Error {}

async function getPostingAccountById(tx: typeof Db, companyId: string, accountId: string) {
  const [account] = await tx.select().from(chartOfAccounts).where(and(eq(chartOfAccounts.id, accountId), eq(chartOfAccounts.companyId, companyId)));
  return account;
}

/**
 * Catat biaya langsung proyek (Fase 3 Langkah 5). Satu aksi langsung yang sekaligus
 * membuat & memposting jurnal Debit hpp_account_id / Kredit offset_account_id — tidak
 * ada draft (pola sama dgn ar_payments, lihat komentar schema hppProjectCosts.ts).
 * Validasi ulang di sini (defense-in-depth, dropdown UI sudah memfilter): hpp_account_id
 * harus akun posting bertipe 'hpp', offset_account_id harus akun posting (tipe bebas —
 * bisa aset/bank kalau dibayar tunai, bisa kewajiban kalau accrued/belum dibayar).
 */
export async function recordProjectCost(
  tx: typeof Db,
  params: {
    companyId: string;
    contractId: string;
    costDate: string;
    hppAccountId: string;
    offsetAccountId: string;
    amount: string;
    description: string | null;
    recordedBy: string;
  }
): Promise<{ costId: string }> {
  const [contract] = await tx.select().from(contracts).where(and(eq(contracts.id, params.contractId), eq(contracts.companyId, params.companyId)));
  if (!contract) throw new HppError("Kontrak tidak ditemukan.");

  const amountNum = Number(params.amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) throw new HppError("Nominal biaya harus lebih dari 0.");

  const hppAccount = await getPostingAccountById(tx, params.companyId, params.hppAccountId);
  if (!hppAccount || hppAccount.isHeader) {
    throw new HppError("Akun HPP yang dipilih adalah akun header (grup) — hanya akun posting yang boleh dipakai.");
  }
  if (hppAccount.accountType !== "hpp") {
    throw new HppError("Akun yang dipilih bukan akun HPP.");
  }

  const offsetAccount = await getPostingAccountById(tx, params.companyId, params.offsetAccountId);
  if (!offsetAccount || offsetAccount.isHeader) {
    throw new HppError("Akun lawan (Kredit) yang dipilih adalah akun header (grup) — hanya akun posting yang boleh dipakai.");
  }

  const [entry] = await tx
    .insert(journalEntries)
    .values({
      companyId: params.companyId,
      entryDate: params.costDate,
      description: `Biaya proyek - ${params.description ?? contract.id}`,
      createdBy: params.recordedBy,
    })
    .returning();

  await tx.insert(journalEntryLines).values([
    { companyId: params.companyId, journalEntryId: entry.id, accountId: hppAccount.id, lineOrder: 1, debitAmount: params.amount, creditAmount: "0" },
    { companyId: params.companyId, journalEntryId: entry.id, accountId: offsetAccount.id, lineOrder: 2, debitAmount: "0", creditAmount: params.amount },
  ]);

  await postJournalEntry(tx, { companyId: params.companyId, journalEntryId: entry.id, postedBy: params.recordedBy });

  const [cost] = await tx
    .insert(hppProjectCosts)
    .values({
      companyId: params.companyId,
      contractId: params.contractId,
      costDate: params.costDate,
      hppAccountId: hppAccount.id,
      offsetAccountId: offsetAccount.id,
      amount: params.amount,
      description: params.description,
      journalEntryId: entry.id,
      recordedBy: params.recordedBy,
    })
    .returning();

  return { costId: cost.id };
}
