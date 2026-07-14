import { and, eq } from "drizzle-orm";
import type { db as Db } from "@/lib/db";
import { fixedAssets, depreciationRuns, chartOfAccounts, journalEntries, journalEntryLines, type fixedAssetStatusEnum } from "@/drizzle/schema";
import { postJournalEntry } from "./journal";

export class FixedAssetError extends Error {}

type FixedAssetStatus = (typeof fixedAssetStatusEnum.enumValues)[number];

async function getAccount(tx: typeof Db, companyId: string, accountId: string) {
  const [account] = await tx.select().from(chartOfAccounts).where(and(eq(chartOfAccounts.id, accountId), eq(chartOfAccounts.companyId, companyId)));
  return account;
}

/**
 * Buat aset tetap baru. Validasi (Fase 3 Langkah 7): account_id harus akun posting
 * kelompok 121xx, accumulated_depreciation_account_id harus akun posting kelompok
 * 122xx (kontra-aset, normal_balance kredit). depreciation_expense_account_id (biaya,
 * posting) dipilih bebas oleh admin — lihat komentar schema fixedAssets.ts kenapa
 * tidak di-hardcode ke satu kode akun tertentu.
 */
export async function createFixedAsset(
  tx: typeof Db,
  params: {
    companyId: string;
    accountId: string;
    accumulatedDepreciationAccountId: string;
    depreciationExpenseAccountId: string;
    assetName: string;
    acquisitionDate: string;
    acquisitionCost: string;
    usefulLifeMonths: number;
    userId: string;
  }
): Promise<{ assetId: string }> {
  const account = await getAccount(tx, params.companyId, params.accountId);
  if (!account || account.isHeader) {
    throw new FixedAssetError("Akun aset yang dipilih adalah akun header (grup) — hanya akun posting yang boleh dipakai.");
  }
  if (!account.code.startsWith("121")) {
    throw new FixedAssetError("Akun aset harus dari kelompok 121xx (Peralatan & Inventaris Kantor).");
  }

  const accumAccount = await getAccount(tx, params.companyId, params.accumulatedDepreciationAccountId);
  if (!accumAccount || accumAccount.isHeader) {
    throw new FixedAssetError("Akun akumulasi penyusutan yang dipilih adalah akun header (grup) — hanya akun posting yang boleh dipakai.");
  }
  if (!accumAccount.code.startsWith("122")) {
    throw new FixedAssetError("Akun akumulasi penyusutan harus dari kelompok 122xx (Penyusutan).");
  }
  if (accumAccount.normalBalance !== "kredit") {
    throw new FixedAssetError("Akun akumulasi penyusutan harus bersaldo normal kredit (kontra-aset).");
  }

  const expenseAccount = await getAccount(tx, params.companyId, params.depreciationExpenseAccountId);
  if (!expenseAccount || expenseAccount.isHeader) {
    throw new FixedAssetError("Akun beban penyusutan yang dipilih adalah akun header (grup) — hanya akun posting yang boleh dipakai.");
  }
  if (expenseAccount.accountType !== "biaya") {
    throw new FixedAssetError("Akun beban penyusutan harus akun bertipe biaya.");
  }

  const costNum = Number(params.acquisitionCost);
  if (!Number.isFinite(costNum) || costNum <= 0) throw new FixedAssetError("Harga perolehan harus lebih dari 0.");
  if (!Number.isInteger(params.usefulLifeMonths) || params.usefulLifeMonths <= 0) {
    throw new FixedAssetError("Masa manfaat (bulan) harus bilangan bulat lebih dari 0.");
  }

  const [created] = await tx
    .insert(fixedAssets)
    .values({
      companyId: params.companyId,
      accountId: account.id,
      accumulatedDepreciationAccountId: accumAccount.id,
      depreciationExpenseAccountId: expenseAccount.id,
      assetName: params.assetName,
      acquisitionDate: params.acquisitionDate,
      acquisitionCost: params.acquisitionCost,
      usefulLifeMonths: params.usefulLifeMonths,
      createdBy: params.userId,
    })
    .returning();

  return { assetId: created.id };
}

export async function updateFixedAssetStatus(
  tx: typeof Db,
  params: { companyId: string; assetId: string; status: FixedAssetStatus }
): Promise<void> {
  const [updated] = await tx
    .update(fixedAssets)
    .set({ status: params.status, updatedAt: new Date() })
    .where(and(eq(fixedAssets.id, params.assetId), eq(fixedAssets.companyId, params.companyId)))
    .returning();
  if (!updated) throw new FixedAssetError("Aset tidak ditemukan.");
}

/**
 * Jalankan penyusutan garis lurus untuk 1 periode (period_month+period_year), SEMUA
 * aset status='aktif' sekaligus (Fase 3 Langkah 7). Idempotency: cek depreciation_runs
 * dulu SEBELUM proses apa pun — periode yang sama tidak boleh dijalankan 2x, gerbang
 * ini dites eksplisit di .scratch-verify (bukan cuma diasumsikan benar).
 *
 * Per aset: penyusutan bulanan = acquisition_cost / useful_life_months, di-cap ke sisa
 * kapasitas (acquisition_cost - accumulated_depreciation) supaya TIDAK PERNAH lewat
 * 100% — aset yang sudah fully depreciated (sisa kapasitas <= 0) dilewati sepenuhnya,
 * tidak menyumbang baris jurnal apa pun (journal_entry_lines menolak baris nominal 0).
 *
 * "Debit Beban Penyusutan per kelompok aset" (spesifikasi) diwujudkan dengan
 * MENGAGREGASI nominal per depreciation_expense_account_id (sisi Debit) dan per
 * accumulated_depreciation_account_id (sisi Kredit) — aset yang berbagi akun yang
 * sama jadi SATU baris jurnal, bukan satu baris per aset.
 */
export async function runDepreciation(
  tx: typeof Db,
  params: { companyId: string; periodMonth: number; periodYear: number; runBy: string }
): Promise<{ journalEntryId: string; entryNumber: string; assetsProcessed: number }> {
  const [existingRun] = await tx
    .select()
    .from(depreciationRuns)
    .where(
      and(
        eq(depreciationRuns.companyId, params.companyId),
        eq(depreciationRuns.periodMonth, params.periodMonth),
        eq(depreciationRuns.periodYear, params.periodYear)
      )
    );
  if (existingRun) {
    throw new FixedAssetError(`Penyusutan untuk periode ${params.periodMonth}/${params.periodYear} sudah pernah dijalankan sebelumnya.`);
  }

  const activeAssets = await tx.select().from(fixedAssets).where(and(eq(fixedAssets.companyId, params.companyId), eq(fixedAssets.status, "aktif")));

  const debitByExpenseAccount = new Map<string, number>();
  const creditByAccumAccount = new Map<string, number>();
  const assetUpdates: { id: string; newAccumulated: string }[] = [];

  for (const asset of activeAssets) {
    const cost = Number(asset.acquisitionCost);
    const accumulated = Number(asset.accumulatedDepreciation);
    const remainingCapacity = cost - accumulated;
    if (remainingCapacity <= 0) continue;

    const monthlyDepreciation = cost / asset.usefulLifeMonths;
    const amount = Math.min(monthlyDepreciation, remainingCapacity);
    if (amount <= 0) continue;

    debitByExpenseAccount.set(asset.depreciationExpenseAccountId, (debitByExpenseAccount.get(asset.depreciationExpenseAccountId) ?? 0) + amount);
    creditByAccumAccount.set(asset.accumulatedDepreciationAccountId, (creditByAccumAccount.get(asset.accumulatedDepreciationAccountId) ?? 0) + amount);
    assetUpdates.push({ id: asset.id, newAccumulated: (accumulated + amount).toFixed(2) });
  }

  if (assetUpdates.length === 0) {
    throw new FixedAssetError("Tidak ada aset aktif yang perlu disusutkan periode ini (tidak ada aset aktif, atau semua sudah disusutkan penuh).");
  }

  const lastDay = new Date(params.periodYear, params.periodMonth, 0).getDate();
  const entryDate = `${params.periodYear}-${String(params.periodMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const [entry] = await tx
    .insert(journalEntries)
    .values({
      companyId: params.companyId,
      entryDate,
      description: `Penyusutan aset tetap periode ${params.periodMonth}/${params.periodYear}`,
      createdBy: params.runBy,
    })
    .returning();

  let lineOrder = 1;
  const lines = [
    ...[...debitByExpenseAccount].map(([accountId, amount]) => ({
      companyId: params.companyId,
      journalEntryId: entry.id,
      accountId,
      lineOrder: lineOrder++,
      debitAmount: amount.toFixed(2),
      creditAmount: "0",
    })),
    ...[...creditByAccumAccount].map(([accountId, amount]) => ({
      companyId: params.companyId,
      journalEntryId: entry.id,
      accountId,
      lineOrder: lineOrder++,
      debitAmount: "0",
      creditAmount: amount.toFixed(2),
    })),
  ];
  await tx.insert(journalEntryLines).values(lines);

  const { entryNumber } = await postJournalEntry(tx, { companyId: params.companyId, journalEntryId: entry.id, postedBy: params.runBy });

  for (const u of assetUpdates) {
    await tx.update(fixedAssets).set({ accumulatedDepreciation: u.newAccumulated, updatedAt: new Date() }).where(eq(fixedAssets.id, u.id));
  }

  await tx.insert(depreciationRuns).values({
    companyId: params.companyId,
    periodMonth: params.periodMonth,
    periodYear: params.periodYear,
    journalEntryId: entry.id,
    runBy: params.runBy,
  });

  return { journalEntryId: entry.id, entryNumber, assetsProcessed: assetUpdates.length };
}
