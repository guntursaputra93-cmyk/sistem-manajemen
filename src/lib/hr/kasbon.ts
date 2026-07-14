import { and, eq } from "drizzle-orm";
import type { db as Db } from "@/lib/db";
import { kasbonRequests, chartOfAccounts, journalEntries, journalEntryLines } from "@/drizzle/schema";
import { postJournalEntry } from "@/lib/finance/journal";

export class KasbonError extends Error {}

// Akun Piutang Karyawan di-hardcode SENGAJA (beda dari revenue_account_id/
// offset_account_id di modul lain) — spesifikasi Fase 3 Bagian 2.8 eksplisit
// menyebut "Debit 11303 Piutang Karyawan", bukan "akun dipilih admin". Hanya sisi
// Kredit (kas/bank pencairan) yang fleksibel dipilih admin.
const PIUTANG_KARYAWAN_CODE = "11303";

async function getAccountByCode(tx: typeof Db, companyId: string, code: string) {
  const [account] = await tx.select().from(chartOfAccounts).where(and(eq(chartOfAccounts.companyId, companyId), eq(chartOfAccounts.code, code)));
  if (!account) throw new KasbonError(`Akun ${code} tidak ditemukan untuk company ini — hubungi super admin.`);
  return account;
}

async function getPostingAccountById(tx: typeof Db, companyId: string, accountId: string) {
  const [account] = await tx.select().from(chartOfAccounts).where(and(eq(chartOfAccounts.id, accountId), eq(chartOfAccounts.companyId, companyId)));
  return account;
}

/** Ajukan kasbon baru — status selalu 'pending', employeeId di-resolve server-side dari session (bukan input bebas). */
export async function createKasbonRequest(
  tx: typeof Db,
  params: { companyId: string; employeeId: string; totalAmount: string; installmentAmount: string; purpose: string; requestDate: string }
): Promise<{ kasbonId: string }> {
  const totalNum = Number(params.totalAmount);
  const installmentNum = Number(params.installmentAmount);
  if (!Number.isFinite(totalNum) || totalNum <= 0) throw new KasbonError("Total kasbon harus lebih dari 0.");
  if (!Number.isFinite(installmentNum) || installmentNum <= 0) throw new KasbonError("Nominal cicilan per bulan harus lebih dari 0.");
  if (installmentNum > totalNum) throw new KasbonError("Nominal cicilan tidak boleh lebih besar dari total kasbon.");
  if (!params.purpose.trim()) throw new KasbonError("Tujuan/keperluan kasbon wajib diisi.");

  const [created] = await tx
    .insert(kasbonRequests)
    .values({
      companyId: params.companyId,
      employeeId: params.employeeId,
      totalAmount: params.totalAmount,
      installmentAmount: params.installmentAmount,
      remainingBalance: params.totalAmount,
      purpose: params.purpose,
      requestDate: params.requestDate,
    })
    .returning();
  return { kasbonId: created.id };
}

/**
 * Setujui + cairkan sekaligus (tidak ada tahap "dicairkan" terpisah, lihat komentar
 * schema kasbonRequests.ts). Jurnal Debit 11303 Piutang Karyawan / Kredit akun
 * kas/bank yang dipilih admin (isHeader=false, accountType='aset' — validasi luas,
 * "kas/bank" mencakup petty cash 111xx maupun bank 112xx, tidak dipersempit ke satu
 * kelompok kode seperti validasi bank_account_id di AR Langkah 4).
 */
export async function approveAndDisburseKasbon(
  tx: typeof Db,
  params: { companyId: string; kasbonRequestId: string; approverId: string; disbursementAccountId: string }
): Promise<{ entryNumber: string }> {
  const disbursementAccount = await getPostingAccountById(tx, params.companyId, params.disbursementAccountId);
  if (!disbursementAccount || disbursementAccount.isHeader) {
    throw new KasbonError("Akun kas/bank yang dipilih adalah akun header (grup) — hanya akun posting yang boleh dipakai.");
  }
  if (disbursementAccount.accountType !== "aset") {
    throw new KasbonError("Akun yang dipilih harus akun kas/bank (aset).");
  }

  const [kasbon] = await tx
    .update(kasbonRequests)
    .set({
      status: "disetujui",
      approvedBy: params.approverId,
      decidedAt: new Date(),
      disbursementAccountId: disbursementAccount.id,
      updatedAt: new Date(),
    })
    .where(and(eq(kasbonRequests.id, params.kasbonRequestId), eq(kasbonRequests.companyId, params.companyId), eq(kasbonRequests.status, "pending")))
    .returning();
  if (!kasbon) throw new KasbonError("Pengajuan ini sudah diproses sebelumnya.");

  const piutangKaryawan = await getAccountByCode(tx, params.companyId, PIUTANG_KARYAWAN_CODE);

  const [entry] = await tx
    .insert(journalEntries)
    .values({
      companyId: params.companyId,
      entryDate: new Date().toISOString().slice(0, 10),
      description: `Pencairan kasbon - ${kasbon.purpose}`,
      createdBy: params.approverId,
    })
    .returning();

  await tx.insert(journalEntryLines).values([
    { companyId: params.companyId, journalEntryId: entry.id, accountId: piutangKaryawan.id, lineOrder: 1, debitAmount: kasbon.totalAmount, creditAmount: "0" },
    { companyId: params.companyId, journalEntryId: entry.id, accountId: disbursementAccount.id, lineOrder: 2, debitAmount: "0", creditAmount: kasbon.totalAmount },
  ]);

  const { entryNumber } = await postJournalEntry(tx, { companyId: params.companyId, journalEntryId: entry.id, postedBy: params.approverId });

  await tx.update(kasbonRequests).set({ journalEntryId: entry.id, updatedAt: new Date() }).where(eq(kasbonRequests.id, kasbon.id));

  return { entryNumber };
}

export async function rejectKasbon(
  tx: typeof Db,
  params: { companyId: string; kasbonRequestId: string; approverId: string; rejectionReason: string }
): Promise<void> {
  if (!params.rejectionReason.trim()) throw new KasbonError("Alasan penolakan wajib diisi.");

  const [kasbon] = await tx
    .update(kasbonRequests)
    .set({ status: "ditolak", approvedBy: params.approverId, decidedAt: new Date(), rejectionReason: params.rejectionReason, updatedAt: new Date() })
    .where(and(eq(kasbonRequests.id, params.kasbonRequestId), eq(kasbonRequests.companyId, params.companyId), eq(kasbonRequests.status, "pending")))
    .returning();
  if (!kasbon) throw new KasbonError("Pengajuan ini sudah diproses sebelumnya.");
}
