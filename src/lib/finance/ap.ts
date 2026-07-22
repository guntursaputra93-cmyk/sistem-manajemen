import { and, eq, inArray } from "drizzle-orm";
import type { db as Db } from "@/lib/db";
import { apBills, apPayments, chartOfAccounts, type apBillStatusEnum } from "@/drizzle/schema";
import { getNextFinanceSequenceNumber, formatBillNumber } from "./numbering";
import { createAndPostJournal } from "./journal";

export class ApError extends Error {}

const BALANCE_EPSILON = 0.005; // toleransi pembulatan 2 desimal, sama seperti ar.ts
const UTANG_USAHA_CODE = "21101";

type BillStatus = (typeof apBillStatusEnum.enumValues)[number];

async function getPostingAccountById(tx: typeof Db, companyId: string, accountId: string) {
  const [account] = await tx.select().from(chartOfAccounts).where(and(eq(chartOfAccounts.id, accountId), eq(chartOfAccounts.companyId, companyId)));
  return account;
}

async function getAccountByCode(tx: typeof Db, companyId: string, code: string) {
  const [account] = await tx.select().from(chartOfAccounts).where(and(eq(chartOfAccounts.companyId, companyId), eq(chartOfAccounts.code, code)));
  if (!account) throw new ApError(`Akun ${code} tidak ditemukan untuk company ini — hubungi super admin.`);
  return account;
}

/**
 * Posting tagihan pemasok: jurnal Debit akun biaya/HPP/aset / Kredit 21101 Utang Usaha,
 * dibuat lewat createAndPostJournal yang sudah ada (bukan re-implement validasi
 * balance/is_header dari nol — gerbang validasinya tetap satu). Nomor tagihan
 * di-generate HANYA di sini, jadi draft yang batal tidak menghabiskan nomor urut.
 *
 * Kedua baris jurnal ditandai organization_id = pemasok tagihan ini (Item 5b), jadi
 * hutang & biaya pemasok otomatis terekap di Kartu Rekanan tanpa kerja tambahan.
 */
export async function postBill(
  tx: typeof Db,
  params: { companyId: string; billId: string; postedBy: string }
): Promise<{ billNumber: string }> {
  const [bill] = await tx.select().from(apBills).where(and(eq(apBills.id, params.billId), eq(apBills.companyId, params.companyId)));
  if (!bill) throw new ApError("Tagihan tidak ditemukan.");
  if (bill.status !== "draft") throw new ApError("Tagihan ini sudah tidak berstatus draft — tidak bisa diposting lagi.");

  const expenseAccount = await getPostingAccountById(tx, params.companyId, bill.expenseAccountId);
  if (!expenseAccount || expenseAccount.isHeader) {
    throw new ApError("Akun beban yang dipilih adalah akun header (grup) — hanya akun posting yang boleh dipakai.");
  }
  // Tagihan pemasok bisa jatuh ke biaya, HPP, atau pembelian aset — tapi tidak masuk
  // akal ke akun pendapatan/modal.
  if (!["biaya", "hpp", "aset"].includes(expenseAccount.accountType)) {
    throw new ApError("Akun yang dipilih harus bertipe Biaya, HPP, atau Aset.");
  }

  const utangUsaha = await getAccountByCode(tx, params.companyId, UTANG_USAHA_CODE);

  const posted = await createAndPostJournal(tx, {
    companyId: params.companyId,
    entryDate: bill.billDate,
    description: `Tagihan pemasok${bill.supplierRef ? ` ${bill.supplierRef}` : ""} - ${bill.description ?? bill.id}`,
    userId: params.postedBy,
    lines: [
      { accountId: expenseAccount.id, debit: Number(bill.amount), credit: 0, organizationId: bill.organizationId },
      { accountId: utangUsaha.id, debit: 0, credit: Number(bill.amount), organizationId: bill.organizationId },
    ],
  });

  const urut = await getNextFinanceSequenceNumber(tx, { companyId: params.companyId, sequenceType: "tagihan" });
  const postedAt = new Date();
  const billNumber = formatBillNumber(urut, postedAt);

  await tx
    .update(apBills)
    .set({ status: "belum_dibayar", billNumber, journalEntryId: posted.journalEntryId, postedBy: params.postedBy, postedAt })
    .where(eq(apBills.id, bill.id));

  return { billNumber };
}

/**
 * Catat pembayaran hutang: satu aksi yang sekaligus memposting jurnalnya
 * (Debit 21101 Utang Usaha / Kredit akun kas/bank) — tidak ada draft payment,
 * sama seperti AR. Setelah tersimpan, status tagihan dihitung ulang app-level.
 */
export async function recordApPayment(
  tx: typeof Db,
  params: {
    companyId: string;
    billId: string;
    paymentDate: string;
    amount: string;
    bankAccountId: string;
    referenceNote: string | null;
    recordedBy: string;
  }
): Promise<{ paymentId: string }> {
  const [bill] = await tx.select().from(apBills).where(and(eq(apBills.id, params.billId), eq(apBills.companyId, params.companyId)));
  if (!bill) throw new ApError("Tagihan tidak ditemukan.");
  if (bill.status === "draft") throw new ApError("Tagihan masih draft — posting tagihan dulu sebelum mencatat pembayaran.");
  if (bill.status === "lunas") throw new ApError("Tagihan ini sudah lunas — tidak bisa dibayar lagi.");

  const amountNum = Number(params.amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) throw new ApError("Nominal pembayaran harus lebih dari 0.");

  // Tidak boleh membayar melebihi sisa tagihan.
  const existing = await tx.select().from(apPayments).where(eq(apPayments.billId, bill.id));
  const paid = existing.reduce((sum, p) => sum + Number(p.amount), 0);
  const remaining = Number(bill.amount) - paid;
  if (amountNum > remaining + BALANCE_EPSILON) {
    throw new ApError(`Nominal pembayaran (${amountNum.toFixed(2)}) melebihi sisa tagihan (${remaining.toFixed(2)}).`);
  }

  const bankAccount = await getPostingAccountById(tx, params.companyId, params.bankAccountId);
  if (!bankAccount || bankAccount.isHeader) {
    throw new ApError("Akun kas/bank yang dipilih adalah akun header (grup) — hanya akun posting yang boleh dipakai.");
  }
  // Beda dari AR (bank saja) — membayar hutang lazim juga dari kas kecil (111xx).
  if (!bankAccount.code.startsWith("111") && !bankAccount.code.startsWith("112")) {
    throw new ApError("Akun yang dipilih bukan akun kas/bank (kode 111xx/112xx).");
  }

  const utangUsaha = await getAccountByCode(tx, params.companyId, UTANG_USAHA_CODE);

  const posted = await createAndPostJournal(tx, {
    companyId: params.companyId,
    entryDate: params.paymentDate,
    description: `Pembayaran tagihan ${bill.billNumber ?? bill.id}`,
    userId: params.recordedBy,
    lines: [
      { accountId: utangUsaha.id, debit: amountNum, credit: 0, organizationId: bill.organizationId },
      { accountId: bankAccount.id, debit: 0, credit: amountNum, organizationId: bill.organizationId },
    ],
  });

  const [payment] = await tx
    .insert(apPayments)
    .values({
      companyId: params.companyId,
      billId: bill.id,
      paymentDate: params.paymentDate,
      amount: params.amount,
      bankAccountId: bankAccount.id,
      referenceNote: params.referenceNote,
      journalEntryId: posted.journalEntryId,
      recordedBy: params.recordedBy,
    })
    .returning();

  await recalculateBillStatus(tx, { companyId: params.companyId, billId: bill.id });

  return { paymentId: payment.id };
}

/**
 * Hitung ulang status tagihan dari total ap_payments vs amount + due_date vs hari ini.
 * Precedence identik AR: lunas > jatuh_tempo > sebagian > belum_dibayar — tagihan yang
 * sebagian dibayar TAPI sudah lewat jatuh tempo tetap ditandai jatuh_tempo.
 * Idempotent (hanya UPDATE kalau status berubah).
 */
export async function recalculateBillStatus(tx: typeof Db, params: { companyId: string; billId: string }): Promise<void> {
  const [bill] = await tx.select().from(apBills).where(and(eq(apBills.id, params.billId), eq(apBills.companyId, params.companyId)));
  if (!bill || bill.status === "draft") return;

  const payments = await tx.select().from(apPayments).where(eq(apPayments.billId, bill.id));
  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const amount = Number(bill.amount);
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = bill.dueDate < today;

  let nextStatus: BillStatus;
  if (totalPaid >= amount - BALANCE_EPSILON) {
    nextStatus = "lunas";
  } else if (isOverdue) {
    nextStatus = "jatuh_tempo";
  } else if (totalPaid > 0) {
    nextStatus = "sebagian";
  } else {
    nextStatus = "belum_dibayar";
  }

  if (nextStatus !== bill.status) {
    await tx.update(apBills).set({ status: nextStatus }).where(eq(apBills.id, bill.id));
  }
}

/**
 * Tidak ada cron/trigger di sistem ini — transisi ke jatuh_tempo murni berdasarkan
 * due_date bisa "basi" kalau tidak ada pembayaran baru yang memicu perhitungan ulang.
 * Dipanggil dari halaman daftar tagihan tiap kali dibuka (pola sama dgn AR).
 */
export async function refreshOverdueBillStatuses(tx: typeof Db, params: { companyId: string }): Promise<void> {
  const openBills = await tx
    .select({ id: apBills.id })
    .from(apBills)
    .where(and(eq(apBills.companyId, params.companyId), inArray(apBills.status, ["belum_dibayar", "sebagian", "jatuh_tempo"])));
  for (const b of openBills) {
    await recalculateBillStatus(tx, { companyId: params.companyId, billId: b.id });
  }
}
