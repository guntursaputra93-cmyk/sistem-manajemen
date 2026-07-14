import { and, asc, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";
import type { db as Db } from "@/lib/db";
import { journalEntries, journalEntryLines, chartOfAccounts, type accountTypeEnum } from "@/drizzle/schema";

type Account = typeof chartOfAccounts.$inferSelect;
type AccountType = (typeof accountTypeEnum.enumValues)[number];

/**
 * Total debit/kredit posted per akun, dikelompokkan `groupBy accountId` (satu
 * round-trip, bukan N+1). Diekspor (dipakai juga oleh lib/finance/rkapReport.ts,
 * Langkah 6) supaya laporan realisasi anggaran reuse query yang sama, bukan
 * menulis ulang logic agregasi buku besar dari nol.
 */
export async function getPostedLineTotals(
  tx: typeof Db,
  params: { companyId: string; startDate?: string; endDate: string }
): Promise<Map<string, { debit: number; credit: number }>> {
  const conditions = [
    eq(journalEntryLines.companyId, params.companyId),
    eq(journalEntries.status, "posted"),
    lte(journalEntries.entryDate, params.endDate),
  ];
  if (params.startDate) conditions.push(gte(journalEntries.entryDate, params.startDate));

  const rows = await tx
    .select({
      accountId: journalEntryLines.accountId,
      debit: sql<string>`sum(${journalEntryLines.debitAmount})`,
      credit: sql<string>`sum(${journalEntryLines.creditAmount})`,
    })
    .from(journalEntryLines)
    .innerJoin(journalEntries, eq(journalEntryLines.journalEntryId, journalEntries.id))
    .where(and(...conditions))
    .groupBy(journalEntryLines.accountId);

  return new Map(rows.map((r) => [r.accountId, { debit: Number(r.debit), credit: Number(r.credit) }]));
}

/**
 * Kedalaman lewat rantai parentId asli, BUKAN kolom `level` — grup XXX00 yang punya
 * >=2 anak tetap level 3 dengan anaknya juga level 3 (lihat komentar chartOfAccounts.ts),
 * jadi kolom level tidak selalu sama dengan kedalaman pohon nyata. Rollup harus jalan
 * dari daun yang PALING DALAM secara nyata dulu, baru naik, supaya header-di-dalam-header
 * (mis. 11200 BANK di bawah 11000 ASET LANCAR) terakumulasi dengan urutan yang benar.
 */
function realDepth(account: Account, byId: Map<string, Account>): number {
  let depth = 0;
  let current: Account | undefined = account;
  while (current?.parentId) {
    depth++;
    current = byId.get(current.parentId);
  }
  return depth;
}

export type AccountBalanceRow = {
  account: Account;
  /** Saldo akun ini sendiri saja (selalu 0 untuk header — header tidak pernah dijurnal langsung). */
  ownBalance: number;
  /** Saldo akun ini + seluruh keturunannya, tanda mengikuti normal_balance akun ini. */
  balance: number;
};

/**
 * Saldo bertanda "alami" 1 akun mengikuti normal_balance-nya (debit-normal:
 * debit-kredit; kredit-normal: kredit-debit) — dipakai rollUpAccountBalances DAN
 * lib/finance/rkapReport.ts (Langkah 6, laporan realisasi vs anggaran) supaya
 * definisi "aktual" akun konsisten di semua laporan, tidak ada logic sign-flip
 * yang ditulis ulang berbeda-beda di tiap file.
 */
export function computeNaturalBalance(account: Account, raw: { debit: number; credit: number } | undefined): number {
  const netDebit = raw ? raw.debit - raw.credit : 0;
  return account.normalBalance === "debit" ? netDebit : -netDebit;
}

/**
 * Rollup HARUS dijumlahkan dalam kerangka net-debit yang konsisten (debit-kredit
 * mentah, bukan "saldo alami" per akun) — akun kontra (mis. 12201, normal_balance
 * 'kredit') berada di bawah header ber-normal_balance 'debit' (12200 PENYUSUTAN).
 * Kalau saldo alami-per-akun (computeNaturalBalance) langsung dijumlahkan ke induk
 * tanpa dikonversi dulu, kontra-akun akan MENAMBAH bukan MENGURANGI total induknya —
 * bug nyata yang baru ketahuan begitu akun kontra-aset pertama kali benar-benar
 * diposting (Langkah 7, penyusutan; dites & dibuktikan di
 * .scratch-verify/seed-and-verify-fixed-assets.ts — Neraca selisih 2x lipat nilai
 * penyusutan sebelum fix ini). Net-debit dijumlahkan mentah (selalu benar utk
 * dijumlahkan lintas akun apa pun, itulah kenapa neraca saldo selalu balance), tanda
 * "saldo alami" (mengikuti normal_balance) HANYA diterapkan sekali di titik akhir per
 * node saat dikonversi ke nilai tampilan.
 */
function rollUpAccountBalances(accounts: Account[], rawTotals: Map<string, { debit: number; credit: number }>): AccountBalanceRow[] {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const netDebit = new Map<string, number>();
  for (const a of accounts) {
    const raw = rawTotals.get(a.id);
    netDebit.set(a.id, raw ? raw.debit - raw.credit : 0);
  }
  const ownNetDebit = new Map(netDebit);

  const deepestFirst = [...accounts].sort((x, y) => realDepth(y, byId) - realDepth(x, byId));
  for (const a of deepestFirst) {
    if (a.parentId && netDebit.has(a.parentId)) {
      netDebit.set(a.parentId, (netDebit.get(a.parentId) ?? 0) + (netDebit.get(a.id) ?? 0));
    }
  }

  const toBalance = (account: Account, nd: number) => (account.normalBalance === "debit" ? nd : -nd);

  return accounts.map((a) => ({
    account: a,
    ownBalance: toBalance(a, ownNetDebit.get(a.id) ?? 0),
    balance: toBalance(a, netDebit.get(a.id) ?? 0),
  }));
}

function totalForRootType(rows: AccountBalanceRow[], type: AccountType): number {
  return rows.filter((r) => r.account.accountType === type && r.account.parentId === null).reduce((sum, r) => sum + r.balance, 0);
}

export type LedgerLine = {
  lineId: string;
  entryId: string;
  entryNumber: string | null;
  entryDate: string;
  entryDescription: string;
  lineDescription: string | null;
  debit: number;
  credit: number;
  runningBalance: number;
};

/** Buku Besar satu akun: saldo awal (kumulatif sebelum startDate) + mutasi berjalan + saldo berjalan. */
export async function getGeneralLedgerForAccount(
  tx: typeof Db,
  params: { companyId: string; account: Account; startDate: string; endDate: string }
): Promise<{ openingBalance: number; lines: LedgerLine[]; closingBalance: number }> {
  const sign = params.account.normalBalance === "debit" ? 1 : -1;

  const [openingTotals] = await tx
    .select({
      debit: sql<string>`coalesce(sum(${journalEntryLines.debitAmount}), 0)`,
      credit: sql<string>`coalesce(sum(${journalEntryLines.creditAmount}), 0)`,
    })
    .from(journalEntryLines)
    .innerJoin(journalEntries, eq(journalEntryLines.journalEntryId, journalEntries.id))
    .where(
      and(
        eq(journalEntryLines.companyId, params.companyId),
        eq(journalEntryLines.accountId, params.account.id),
        eq(journalEntries.status, "posted"),
        lt(journalEntries.entryDate, params.startDate)
      )
    );
  const openingBalance = sign * (Number(openingTotals.debit) - Number(openingTotals.credit));

  const rows = await tx
    .select({ line: journalEntryLines, entry: journalEntries })
    .from(journalEntryLines)
    .innerJoin(journalEntries, eq(journalEntryLines.journalEntryId, journalEntries.id))
    .where(
      and(
        eq(journalEntryLines.companyId, params.companyId),
        eq(journalEntryLines.accountId, params.account.id),
        eq(journalEntries.status, "posted"),
        gte(journalEntries.entryDate, params.startDate),
        lte(journalEntries.entryDate, params.endDate)
      )
    )
    .orderBy(asc(journalEntries.entryDate), asc(journalEntries.entryNumber), asc(journalEntryLines.lineOrder));

  let running = openingBalance;
  const lines: LedgerLine[] = rows.map((r) => {
    const debit = Number(r.line.debitAmount);
    const credit = Number(r.line.creditAmount);
    running += sign * (debit - credit);
    return {
      lineId: r.line.id,
      entryId: r.entry.id,
      entryNumber: r.entry.entryNumber,
      entryDate: r.entry.entryDate,
      entryDescription: r.entry.description,
      lineDescription: r.line.description,
      debit,
      credit,
      runningBalance: running,
    };
  });

  return { openingBalance, lines, closingBalance: running };
}

export type IncomeStatement = {
  rows: AccountBalanceRow[];
  pendapatanTotal: number;
  hppTotal: number;
  biayaTotal: number;
  labaKotor: number;
  labaBersih: number;
};

/**
 * Laba Rugi periode [startDate, endDate] — agregat pendapatan/hpp/biaya dari jurnal
 * posted saja. startDate boleh kosong (berarti "sejak awal berdiri") — dipakai
 * getBalanceSheet untuk menghitung laba tahun-tahun sebelumnya yang belum ditutup.
 */
export async function getIncomeStatement(
  tx: typeof Db,
  params: { companyId: string; startDate?: string; endDate: string }
): Promise<IncomeStatement> {
  const accounts = await tx
    .select()
    .from(chartOfAccounts)
    .where(and(eq(chartOfAccounts.companyId, params.companyId), inArray(chartOfAccounts.accountType, ["pendapatan", "hpp", "biaya"])))
    .orderBy(asc(chartOfAccounts.code));

  const totals = await getPostedLineTotals(tx, { companyId: params.companyId, startDate: params.startDate, endDate: params.endDate });
  const rows = rollUpAccountBalances(accounts, totals);

  const pendapatanTotal = totalForRootType(rows, "pendapatan");
  const hppTotal = totalForRootType(rows, "hpp");
  const biayaTotal = totalForRootType(rows, "biaya");
  const labaKotor = pendapatanTotal - hppTotal;
  const labaBersih = labaKotor - biayaTotal;

  return { rows, pendapatanTotal, hppTotal, biayaTotal, labaKotor, labaBersih };
}

export type BalanceSheet = {
  rows: AccountBalanceRow[];
  asetTotal: number;
  kewajibanTotal: number;
  modalTotal: number;
  /** Laba/rugi tahun berjalan (1 Jan tahun asOfDate s/d asOfDate), masuk ke sisi Modal. */
  netIncomeYtd: number;
  /**
   * Laba/rugi tahun-tahun SEBELUM tahun asOfDate (sejak awal berdiri s/d 31 Des
   * tahun lalu) yang belum pernah dipindah manual ke akun 32101 Laba Rugi Ditahan
   * lewat jurnal tutup buku — lihat komentar getBalanceSheet. 0 kalau company baru
   * berjalan di tahun asOfDate atau semua tahun sebelumnya sudah ditutup manual.
   */
  unclosedPriorYearsEarnings: number;
  /** aset - (kewajiban + modal); harus ~0 kalau data konsisten — ditampilkan di UI utk diagnosa, bukan digate. */
  selisih: number;
};

/**
 * Neraca per tanggal asOfDate. Sistem ini TIDAK punya jurnal tutup buku otomatis
 * (Fase 3 Bagian 0: semua logika otomatis app-level, bukan trigger; daftar 11 langkah
 * Bagian 2 juga tidak menyebut "closing entries" tahunan sama sekali) — akun 32101
 * Laba Rugi Ditahan hanya berubah lewat jurnal manual siapa pun.
 *
 * Supaya Neraca tetap balance TANPA bergantung pada closing manual yang mungkin
 * belum pernah dilakukan, laba/rugi dihitung on-the-fly dari akun pendapatan/hpp/biaya
 * dan dipecah 2 baris ke sisi Modal:
 *   - "Laba (Rugi) Tahun Berjalan": 1 Jan tahun asOfDate s/d asOfDate.
 *   - "Laba (Rugi) Tahun Sebelumnya (belum ditutup)": sejak awal berdiri s/d 31 Des
 *     tahun lalu — kalau company sudah lewat >1 tahun fiskal dan belum pernah ada
 *     jurnal tutup buku ke 32101, angka ini TIDAK akan 0. Tanpa baris kedua ini,
 *     Neraca untuk company multi-tahun akan selisih sebesar akumulasi laba tahun
 *     lalu yang belum ditutup (sudah membentuk saldo aset/kas, tapi belum "diakui"
 *     di sisi Modal) — dites & dibuktikan di .scratch-verify/seed-and-verify-reports.ts.
 * Total keduanya = laba/rugi kumulatif sejak awal berdiri s/d asOfDate, yang secara
 * identitas double-entry SELALU membuat Aset = Kewajiban + Modal, apa pun rentang
 * tahunnya — tidak butuh asumsi tutup buku sudah/belum terjadi.
 */
export async function getBalanceSheet(tx: typeof Db, params: { companyId: string; asOfDate: string }): Promise<BalanceSheet> {
  const accounts = await tx
    .select()
    .from(chartOfAccounts)
    .where(and(eq(chartOfAccounts.companyId, params.companyId), inArray(chartOfAccounts.accountType, ["aset", "kewajiban", "modal"])))
    .orderBy(asc(chartOfAccounts.code));

  const totals = await getPostedLineTotals(tx, { companyId: params.companyId, endDate: params.asOfDate });
  const rows = rollUpAccountBalances(accounts, totals);

  const fiscalYearStart = `${params.asOfDate.slice(0, 4)}-01-01`;
  const priorYearEnd = new Date(fiscalYearStart);
  priorYearEnd.setDate(priorYearEnd.getDate() - 1);

  const [currentYear, priorYears] = await Promise.all([
    getIncomeStatement(tx, { companyId: params.companyId, startDate: fiscalYearStart, endDate: params.asOfDate }),
    getIncomeStatement(tx, { companyId: params.companyId, endDate: priorYearEnd.toISOString().slice(0, 10) }),
  ]);

  const asetTotal = totalForRootType(rows, "aset");
  const kewajibanTotal = totalForRootType(rows, "kewajiban");
  const modalTotal = totalForRootType(rows, "modal") + currentYear.labaBersih + priorYears.labaBersih;
  const selisih = asetTotal - (kewajibanTotal + modalTotal);

  return {
    rows,
    asetTotal,
    kewajibanTotal,
    modalTotal,
    netIncomeYtd: currentYear.labaBersih,
    unclosedPriorYearsEarnings: priorYears.labaBersih,
    selisih,
  };
}
