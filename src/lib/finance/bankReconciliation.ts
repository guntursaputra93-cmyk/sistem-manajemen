import { and, asc, eq } from "drizzle-orm";
import type { db as Db } from "@/lib/db";
import { bankReconciliations, bankReconciliationItems, chartOfAccounts, journalEntryLines, journalEntries } from "@/drizzle/schema";
import { getGeneralLedgerForAccount } from "./reports";

export class BankReconciliationError extends Error {}

function periodRange(periodMonth: number, periodYear: number): { periodStart: string; periodEnd: string } {
  const periodStart = `${periodYear}-${String(periodMonth).padStart(2, "0")}-01`;
  const lastDay = new Date(periodYear, periodMonth, 0).getDate();
  const periodEnd = `${periodYear}-${String(periodMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { periodStart, periodEnd };
}

/**
 * Buka rekonsiliasi bank utk 1 akun + 1 periode. book_balance & daftar item DITARIK
 * dari getGeneralLedgerForAccount (Langkah 3) — TIDAK ada query saldo/mutasi baru
 * yang ditulis ulang di sini, sesuai instruksi Gtr. Idempotency: unique constraint
 * (company+account+periode) + cek app-level di bawah, pola sama seperti
 * depreciation_runs — satu kombinasi akun+periode hanya boleh punya 1 rekonsiliasi,
 * seterusnya (draft maupun selesai), bukan cuma "1 yang masih draft".
 */
export async function openBankReconciliation(
  tx: typeof Db,
  params: { companyId: string; bankAccountId: string; periodMonth: number; periodYear: number; createdBy: string }
): Promise<{ reconciliationId: string; itemCount: number }> {
  const [existing] = await tx
    .select()
    .from(bankReconciliations)
    .where(
      and(
        eq(bankReconciliations.companyId, params.companyId),
        eq(bankReconciliations.bankAccountId, params.bankAccountId),
        eq(bankReconciliations.periodMonth, params.periodMonth),
        eq(bankReconciliations.periodYear, params.periodYear)
      )
    );
  if (existing) {
    throw new BankReconciliationError(`Rekonsiliasi untuk akun ini periode ${params.periodMonth}/${params.periodYear} sudah pernah dibuka.`);
  }

  const [account] = await tx.select().from(chartOfAccounts).where(and(eq(chartOfAccounts.id, params.bankAccountId), eq(chartOfAccounts.companyId, params.companyId)));
  if (!account || account.isHeader) {
    throw new BankReconciliationError("Akun yang dipilih adalah akun header (grup) — hanya akun posting yang boleh direkonsiliasi.");
  }
  if (!account.code.startsWith("112")) {
    throw new BankReconciliationError("Akun yang dipilih harus akun bank (kode 112xx).");
  }

  const { periodStart, periodEnd } = periodRange(params.periodMonth, params.periodYear);
  const ledger = await getGeneralLedgerForAccount(tx, { companyId: params.companyId, account, startDate: periodStart, endDate: periodEnd });

  const [reconciliation] = await tx
    .insert(bankReconciliations)
    .values({
      companyId: params.companyId,
      bankAccountId: account.id,
      periodMonth: params.periodMonth,
      periodYear: params.periodYear,
      bookBalance: ledger.closingBalance.toFixed(2),
      createdBy: params.createdBy,
    })
    .returning();

  if (ledger.lines.length > 0) {
    await tx.insert(bankReconciliationItems).values(
      ledger.lines.map((l) => ({
        companyId: params.companyId,
        reconciliationId: reconciliation.id,
        journalEntryLineId: l.lineId,
        isCleared: false,
      }))
    );
  }

  return { reconciliationId: reconciliation.id, itemCount: ledger.lines.length };
}

export async function setStatementEndingBalance(
  tx: typeof Db,
  params: { companyId: string; reconciliationId: string; statementEndingBalance: string }
): Promise<void> {
  const [updated] = await tx
    .update(bankReconciliations)
    .set({ statementEndingBalance: params.statementEndingBalance, updatedAt: new Date() })
    .where(and(eq(bankReconciliations.id, params.reconciliationId), eq(bankReconciliations.companyId, params.companyId), eq(bankReconciliations.status, "draft")))
    .returning();
  if (!updated) throw new BankReconciliationError("Rekonsiliasi tidak ditemukan atau sudah selesai — tidak bisa diubah lagi.");
}

export async function setItemCleared(
  tx: typeof Db,
  params: { companyId: string; reconciliationId: string; itemId: string; isCleared: boolean; notes: string | null }
): Promise<void> {
  const [reconciliation] = await tx
    .select()
    .from(bankReconciliations)
    .where(and(eq(bankReconciliations.id, params.reconciliationId), eq(bankReconciliations.companyId, params.companyId)));
  if (!reconciliation) throw new BankReconciliationError("Rekonsiliasi tidak ditemukan.");
  if (reconciliation.status !== "draft") throw new BankReconciliationError("Rekonsiliasi ini sudah selesai — item tidak bisa diubah lagi.");

  const [updated] = await tx
    .update(bankReconciliationItems)
    .set({ isCleared: params.isCleared, notes: params.notes })
    .where(and(eq(bankReconciliationItems.id, params.itemId), eq(bankReconciliationItems.reconciliationId, params.reconciliationId)))
    .returning();
  if (!updated) throw new BankReconciliationError("Item rekonsiliasi tidak ditemukan.");
}

/**
 * Aturan minimal status='selesai' (spesifikasi Langkah 9, diputuskan sendiri): saldo
 * rekening koran wajib sudah diisi, DAN setiap item wajib sudah is_cleared=true ATAU
 * punya catatan (notes) yang menjelaskan kenapa belum cleared (mis. "cek belum cair",
 * "setoran dalam perjalanan") — supaya "selesai" berarti admin benar-benar sudah
 * meninjau tiap baris, bukan asal klik tanpa memeriksa satu pun.
 */
export async function completeBankReconciliation(
  tx: typeof Db,
  params: { companyId: string; reconciliationId: string; completedBy: string }
): Promise<void> {
  const [reconciliation] = await tx
    .select()
    .from(bankReconciliations)
    .where(and(eq(bankReconciliations.id, params.reconciliationId), eq(bankReconciliations.companyId, params.companyId)));
  if (!reconciliation) throw new BankReconciliationError("Rekonsiliasi tidak ditemukan.");
  if (reconciliation.status !== "draft") throw new BankReconciliationError("Rekonsiliasi ini sudah selesai.");
  if (reconciliation.statementEndingBalance === null) {
    throw new BankReconciliationError("Saldo rekening koran (statement ending balance) wajib diisi sebelum rekonsiliasi bisa diselesaikan.");
  }

  const items = await tx.select().from(bankReconciliationItems).where(eq(bankReconciliationItems.reconciliationId, reconciliation.id));
  const unexplained = items.filter((i) => !i.isCleared && !i.notes?.trim());
  if (unexplained.length > 0) {
    throw new BankReconciliationError(
      `${unexplained.length} item belum ditandai cleared dan belum ada catatan penjelasan — tandai cleared atau isi catatan dulu sebelum menyelesaikan.`
    );
  }

  const [updated] = await tx
    .update(bankReconciliations)
    .set({ status: "selesai", completedBy: params.completedBy, completedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(bankReconciliations.id, reconciliation.id), eq(bankReconciliations.status, "draft")))
    .returning();
  if (!updated) throw new BankReconciliationError("Rekonsiliasi ini sudah selesai.");
}

export type BankReconciliationItemRow = {
  item: typeof bankReconciliationItems.$inferSelect;
  line: typeof journalEntryLines.$inferSelect | null;
  entry: typeof journalEntries.$inferSelect | null;
};

export type BankReconciliationSummary = {
  reconciliation: typeof bankReconciliations.$inferSelect;
  account: typeof chartOfAccounts.$inferSelect;
  items: BankReconciliationItemRow[];
  openingBalance: number;
  clearedTotal: number;
  unclearedTotal: number;
  /** Saldo versi "sudah cocok bank" — opening + hanya mutasi yang sudah cleared. */
  clearedBalance: number;
  /** statementEndingBalance - clearedBalance; ~0 kalau rekonsiliasi konsisten. null kalau statement belum diisi. */
  selisih: number | null;
};

/**
 * Ringkasan 1 rekonsiliasi utk halaman detail — reuse getGeneralLedgerForAccount lagi
 * (hanya utk openingBalance, daftar baris sudah tersimpan di bank_reconciliation_items
 * jadi tidak query ulang journal_entry_lines dari nol utk itu).
 */
export async function getBankReconciliationSummary(
  tx: typeof Db,
  params: { companyId: string; reconciliationId: string }
): Promise<BankReconciliationSummary> {
  const [reconciliation] = await tx
    .select()
    .from(bankReconciliations)
    .where(and(eq(bankReconciliations.id, params.reconciliationId), eq(bankReconciliations.companyId, params.companyId)));
  if (!reconciliation) throw new BankReconciliationError("Rekonsiliasi tidak ditemukan.");

  const [account] = await tx.select().from(chartOfAccounts).where(eq(chartOfAccounts.id, reconciliation.bankAccountId));

  const items = await tx
    .select({ item: bankReconciliationItems, line: journalEntryLines, entry: journalEntries })
    .from(bankReconciliationItems)
    .leftJoin(journalEntryLines, eq(journalEntryLines.id, bankReconciliationItems.journalEntryLineId))
    .leftJoin(journalEntries, eq(journalEntries.id, journalEntryLines.journalEntryId))
    .where(eq(bankReconciliationItems.reconciliationId, reconciliation.id))
    .orderBy(asc(journalEntries.entryDate));

  const { periodStart, periodEnd } = periodRange(reconciliation.periodMonth, reconciliation.periodYear);
  const ledger = await getGeneralLedgerForAccount(tx, { companyId: params.companyId, account, startDate: periodStart, endDate: periodEnd });

  const sign = account.normalBalance === "debit" ? 1 : -1;
  let clearedTotal = 0;
  let unclearedTotal = 0;
  for (const row of items) {
    if (!row.line) continue;
    const signedAmount = sign * (Number(row.line.debitAmount) - Number(row.line.creditAmount));
    if (row.item.isCleared) clearedTotal += signedAmount;
    else unclearedTotal += signedAmount;
  }

  const clearedBalance = ledger.openingBalance + clearedTotal;
  const selisih = reconciliation.statementEndingBalance !== null ? Number(reconciliation.statementEndingBalance) - clearedBalance : null;

  return { reconciliation, account, items, openingBalance: ledger.openingBalance, clearedTotal, unclearedTotal, clearedBalance, selisih };
}
