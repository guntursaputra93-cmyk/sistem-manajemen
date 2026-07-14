import { and, eq, inArray } from "drizzle-orm";
import type { db as Db } from "@/lib/db";
import { arInvoices, arPayments, chartOfAccounts, journalEntries, journalEntryLines, type arInvoiceStatusEnum } from "@/drizzle/schema";
import { getNextFinanceSequenceNumber, formatInvoiceNumber } from "./numbering";
import { postJournalEntry } from "./journal";

export class ArError extends Error {}

const BALANCE_EPSILON = 0.005; // toleransi pembulatan 2 desimal (numeric(15,2)), sama seperti journal.ts
const PIUTANG_USAHA_CODE = "11301";

type InvoiceStatus = (typeof arInvoiceStatusEnum.enumValues)[number];

async function getPostingAccountById(tx: typeof Db, companyId: string, accountId: string) {
  const [account] = await tx.select().from(chartOfAccounts).where(and(eq(chartOfAccounts.id, accountId), eq(chartOfAccounts.companyId, companyId)));
  return account;
}

async function getAccountByCode(tx: typeof Db, companyId: string, code: string) {
  const [account] = await tx.select().from(chartOfAccounts).where(and(eq(chartOfAccounts.companyId, companyId), eq(chartOfAccounts.code, code)));
  if (!account) throw new ArError(`Akun ${code} tidak ditemukan untuk company ini — hubungi super admin.`);
  return account;
}

/**
 * Posting invoice AR: validasi ulang akun pendapatan (defense-in-depth, dropdown UI
 * sudah memfilter tapi request bisa dibuat manual di luar form — pola sama dengan
 * postJournalEntry Fase 3 Langkah 2), generate jurnal Debit 11301 Piutang Usaha /
 * Kredit revenue_account_id lewat postJournalEntry yang sudah ada (bukan re-implement
 * validasi balance/is_header dari nol), generate nomor invoice HANYA di sini (draft
 * yang batal tidak pernah menghabiskan nomor urut), ubah status draft -> belum_dibayar.
 */
export async function postInvoice(
  tx: typeof Db,
  params: { companyId: string; invoiceId: string; postedBy: string }
): Promise<{ invoiceNumber: string }> {
  const [invoice] = await tx.select().from(arInvoices).where(and(eq(arInvoices.id, params.invoiceId), eq(arInvoices.companyId, params.companyId)));
  if (!invoice) throw new ArError("Invoice tidak ditemukan.");
  if (invoice.status !== "draft") throw new ArError("Invoice ini sudah tidak berstatus draft — tidak bisa diposting lagi.");

  const revenueAccount = await getPostingAccountById(tx, params.companyId, invoice.revenueAccountId);
  if (!revenueAccount || revenueAccount.isHeader) {
    throw new ArError("Akun pendapatan yang dipilih adalah akun header (grup) — hanya akun posting yang boleh dipakai.");
  }
  if (revenueAccount.accountType !== "pendapatan") {
    throw new ArError("Akun yang dipilih bukan akun pendapatan.");
  }

  const piutangUsaha = await getAccountByCode(tx, params.companyId, PIUTANG_USAHA_CODE);

  const [entry] = await tx
    .insert(journalEntries)
    .values({
      companyId: params.companyId,
      entryDate: invoice.invoiceDate,
      description: `Invoice AR${invoice.invoiceNumber ? ` ${invoice.invoiceNumber}` : ""} - ${invoice.description ?? invoice.id}`,
      createdBy: params.postedBy,
    })
    .returning();

  await tx.insert(journalEntryLines).values([
    { companyId: params.companyId, journalEntryId: entry.id, accountId: piutangUsaha.id, lineOrder: 1, debitAmount: invoice.amount, creditAmount: "0" },
    { companyId: params.companyId, journalEntryId: entry.id, accountId: revenueAccount.id, lineOrder: 2, debitAmount: "0", creditAmount: invoice.amount },
  ]);

  await postJournalEntry(tx, { companyId: params.companyId, journalEntryId: entry.id, postedBy: params.postedBy });

  const urut = await getNextFinanceSequenceNumber(tx, { companyId: params.companyId, sequenceType: "invoice" });
  const postedAt = new Date();
  const invoiceNumber = formatInvoiceNumber(urut, postedAt);

  await tx
    .update(arInvoices)
    .set({ status: "belum_dibayar", invoiceNumber, journalEntryId: entry.id, postedBy: params.postedBy, postedAt })
    .where(eq(arInvoices.id, invoice.id));

  return { invoiceNumber };
}

/**
 * Catat pembayaran AR. Beda dari jurnal umum, mencatat payment adalah satu aksi
 * langsung yang sekaligus posting jurnalnya (Debit bank_account_id / Kredit 11301
 * Piutang Usaha) — tidak ada draft payment (lihat komentar schema arPayments.ts).
 * Setelah tersimpan, recalculateInvoiceStatus dipanggil (app-level function, BUKAN
 * trigger, sesuai Fase 3 Bagian 0) untuk menentukan status invoice terbaru.
 */
export async function recordPayment(
  tx: typeof Db,
  params: {
    companyId: string;
    invoiceId: string;
    paymentDate: string;
    amount: string;
    bankAccountId: string;
    referenceNote: string | null;
    recordedBy: string;
  }
): Promise<{ paymentId: string }> {
  const [invoice] = await tx.select().from(arInvoices).where(and(eq(arInvoices.id, params.invoiceId), eq(arInvoices.companyId, params.companyId)));
  if (!invoice) throw new ArError("Invoice tidak ditemukan.");
  if (invoice.status === "draft") throw new ArError("Invoice masih draft — posting invoice dulu sebelum mencatat pembayaran.");
  if (invoice.status === "lunas") throw new ArError("Invoice ini sudah lunas — tidak bisa menerima pembayaran lagi.");

  const amountNum = Number(params.amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) throw new ArError("Nominal pembayaran harus lebih dari 0.");

  const bankAccount = await getPostingAccountById(tx, params.companyId, params.bankAccountId);
  if (!bankAccount || bankAccount.isHeader) {
    throw new ArError("Akun bank yang dipilih adalah akun header (grup) — hanya akun posting yang boleh dipakai.");
  }
  if (!bankAccount.code.startsWith("112")) {
    throw new ArError("Akun yang dipilih bukan akun bank (kode 112xx).");
  }

  const piutangUsaha = await getAccountByCode(tx, params.companyId, PIUTANG_USAHA_CODE);

  const [entry] = await tx
    .insert(journalEntries)
    .values({
      companyId: params.companyId,
      entryDate: params.paymentDate,
      description: `Pembayaran invoice ${invoice.invoiceNumber ?? invoice.id}`,
      createdBy: params.recordedBy,
    })
    .returning();

  await tx.insert(journalEntryLines).values([
    { companyId: params.companyId, journalEntryId: entry.id, accountId: bankAccount.id, lineOrder: 1, debitAmount: params.amount, creditAmount: "0" },
    { companyId: params.companyId, journalEntryId: entry.id, accountId: piutangUsaha.id, lineOrder: 2, debitAmount: "0", creditAmount: params.amount },
  ]);

  await postJournalEntry(tx, { companyId: params.companyId, journalEntryId: entry.id, postedBy: params.recordedBy });

  const [payment] = await tx
    .insert(arPayments)
    .values({
      companyId: params.companyId,
      invoiceId: invoice.id,
      paymentDate: params.paymentDate,
      amount: params.amount,
      bankAccountId: bankAccount.id,
      referenceNote: params.referenceNote,
      journalEntryId: entry.id,
      recordedBy: params.recordedBy,
    })
    .returning();

  await recalculateInvoiceStatus(tx, { companyId: params.companyId, invoiceId: invoice.id });

  return { paymentId: payment.id };
}

/**
 * Hitung ulang status invoice dari total ar_payments vs amount + due_date vs hari ini.
 * Precedence (bukan mutually-exclusive dari nominal semata): lunas > jatuh_tempo >
 * sebagian > belum_dibayar — invoice yang sebagian dibayar TAPI sudah lewat jatuh
 * tempo tetap ditandai jatuh_tempo, bukan sebagian (spesifikasi Fase 3 Langkah 4).
 * Idempotent & aman dipanggil berkali-kali (hanya UPDATE kalau status berubah).
 */
export async function recalculateInvoiceStatus(tx: typeof Db, params: { companyId: string; invoiceId: string }): Promise<void> {
  const [invoice] = await tx.select().from(arInvoices).where(and(eq(arInvoices.id, params.invoiceId), eq(arInvoices.companyId, params.companyId)));
  if (!invoice || invoice.status === "draft") return;

  const payments = await tx.select().from(arPayments).where(eq(arPayments.invoiceId, invoice.id));
  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const amount = Number(invoice.amount);
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = invoice.dueDate < today;

  let nextStatus: InvoiceStatus;
  if (totalPaid >= amount - BALANCE_EPSILON) {
    nextStatus = "lunas";
  } else if (isOverdue) {
    nextStatus = "jatuh_tempo";
  } else if (totalPaid > 0) {
    nextStatus = "sebagian";
  } else {
    nextStatus = "belum_dibayar";
  }

  if (nextStatus !== invoice.status) {
    await tx.update(arInvoices).set({ status: nextStatus }).where(eq(arInvoices.id, invoice.id));
  }
}

/**
 * Tidak ada cron/trigger di sistem ini (Fase 3 Bagian 0) — transisi ke jatuh_tempo
 * murni berdasarkan due_date bisa "basi" kalau tidak ada payment baru yang memicu
 * recalculateInvoiceStatus. Dipanggil dari halaman daftar invoice tiap kali dibuka
 * (masih app-level function biasa, BUKAN DB trigger) supaya status tetap segar
 * tanpa perlu job terjadwal.
 */
export async function refreshOverdueInvoiceStatuses(tx: typeof Db, params: { companyId: string }): Promise<void> {
  const openInvoices = await tx
    .select({ id: arInvoices.id })
    .from(arInvoices)
    .where(and(eq(arInvoices.companyId, params.companyId), inArray(arInvoices.status, ["belum_dibayar", "sebagian", "jatuh_tempo"])));
  for (const inv of openInvoices) {
    await recalculateInvoiceStatus(tx, { companyId: params.companyId, invoiceId: inv.id });
  }
}
