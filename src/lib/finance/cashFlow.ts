import { and, eq, gte, lt, lte } from "drizzle-orm";
import type { db as Db } from "@/lib/db";
import { chartOfAccounts, journalEntries, journalEntryLines } from "@/drizzle/schema";

// ===== Laporan Arus Kas (metode langsung, per transaksi) =====
//
// Definisi "kas" = semua akun posting KAS (111xx) + BANK (112xx) — konvensi kode
// yang sama dipakai rekonsiliasi bank (112xx) dan seed COA.
//
// Klasifikasi per jurnal (bukan per baris): untuk tiap jurnal posted yang
// menyentuh akun kas, lihat baris LAWAN (non-kas) dan pilih kategori dengan
// nominal terbesar:
//   - investasi : akun lawan kode 12xxx (aset tetap & akumulasinya)
//   - pendanaan : akun lawan bertipe modal ATAU kewajiban jangka panjang (22xxx)
//   - operasi   : selain itu (pendapatan, HPP, biaya, piutang, kewajiban lancar, dst)
// Pendekatan ini sederhana namun konsisten — jurnal campuran diklasifikasikan ke
// kategori dominan, dan totalnya selalu = perubahan kas (tidak ada selisih).

export type CashFlowCategory = "operasi" | "investasi" | "pendanaan";

export type CashFlowLine = {
  entryId: string;
  entryDate: string;
  entryNumber: string | null;
  description: string;
  /** Positif = kas masuk, negatif = kas keluar. */
  amount: number;
};

export type CashFlowReport = {
  openingBalance: number;
  closingBalance: number;
  netChange: number;
  categories: Record<CashFlowCategory, { total: number; lines: CashFlowLine[] }>;
};

function isCashCode(code: string): boolean {
  return code.startsWith("111") || code.startsWith("112");
}

function categoryOfAccount(code: string, accountType: string): CashFlowCategory {
  if (code.startsWith("12")) return "investasi";
  if (accountType === "modal" || code.startsWith("22")) return "pendanaan";
  return "operasi";
}

export async function getCashFlowReport(
  tx: typeof Db,
  params: { companyId: string; startDate: string; endDate: string }
): Promise<CashFlowReport> {
  const { companyId, startDate, endDate } = params;

  const accounts = await tx.select().from(chartOfAccounts).where(eq(chartOfAccounts.companyId, companyId));
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  // Saldo kas awal: mutasi semua akun kas dari jurnal posted SEBELUM periode.
  const beforeLines = await tx
    .select({
      accountId: journalEntryLines.accountId,
      debit: journalEntryLines.debitAmount,
      credit: journalEntryLines.creditAmount,
    })
    .from(journalEntryLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalEntryLines.journalEntryId))
    .where(and(eq(journalEntryLines.companyId, companyId), eq(journalEntries.status, "posted"), lt(journalEntries.entryDate, startDate)));

  let openingBalance = 0;
  for (const l of beforeLines) {
    const acc = accountById.get(l.accountId);
    if (acc && !acc.isHeader && isCashCode(acc.code)) openingBalance += Number(l.debit) - Number(l.credit);
  }

  // Semua baris jurnal posted DALAM periode (join utk tanggal/nomor/uraian).
  const periodLines = await tx
    .select({
      entryId: journalEntries.id,
      entryDate: journalEntries.entryDate,
      entryNumber: journalEntries.entryNumber,
      description: journalEntries.description,
      accountId: journalEntryLines.accountId,
      debit: journalEntryLines.debitAmount,
      credit: journalEntryLines.creditAmount,
    })
    .from(journalEntryLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalEntryLines.journalEntryId))
    .where(
      and(
        eq(journalEntryLines.companyId, companyId),
        eq(journalEntries.status, "posted"),
        gte(journalEntries.entryDate, startDate),
        lte(journalEntries.entryDate, endDate)
      )
    );

  // Kelompokkan per jurnal.
  const byEntry = new Map<string, typeof periodLines>();
  for (const l of periodLines) {
    const list = byEntry.get(l.entryId) ?? [];
    list.push(l);
    byEntry.set(l.entryId, list);
  }

  const categories: CashFlowReport["categories"] = {
    operasi: { total: 0, lines: [] },
    investasi: { total: 0, lines: [] },
    pendanaan: { total: 0, lines: [] },
  };

  for (const [entryId, lines] of byEntry) {
    let cashDelta = 0;
    const counterWeight: Record<CashFlowCategory, number> = { operasi: 0, investasi: 0, pendanaan: 0 };

    for (const l of lines) {
      const acc = accountById.get(l.accountId);
      if (!acc) continue;
      const amount = Number(l.debit) - Number(l.credit);
      if (!acc.isHeader && isCashCode(acc.code)) {
        cashDelta += amount;
      } else {
        counterWeight[categoryOfAccount(acc.code, acc.accountType)] += Math.abs(amount);
      }
    }

    if (Math.abs(cashDelta) < 0.005) continue; // jurnal non-kas (mis. penyusutan, akrual)

    const category = (Object.entries(counterWeight) as [CashFlowCategory, number][]).sort((a, b) => b[1] - a[1])[0][0];
    const first = lines[0];
    categories[category].lines.push({
      entryId,
      entryDate: first.entryDate,
      entryNumber: first.entryNumber,
      description: first.description,
      amount: cashDelta,
    });
    categories[category].total += cashDelta;
  }

  for (const cat of Object.values(categories)) {
    cat.lines.sort((a, b) => a.entryDate.localeCompare(b.entryDate));
  }

  const netChange = categories.operasi.total + categories.investasi.total + categories.pendanaan.total;

  return {
    openingBalance,
    closingBalance: openingBalance + netChange,
    netChange,
    categories,
  };
}
