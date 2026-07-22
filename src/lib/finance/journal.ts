import { and, eq, inArray } from "drizzle-orm";
import type { db as Db } from "@/lib/db";
import { journalEntries, journalEntryLines, chartOfAccounts } from "@/drizzle/schema";
import { getNextFinanceSequenceNumber, formatJournalEntryNumber } from "./numbering";

export class JournalError extends Error {}

const BALANCE_EPSILON = 0.005; // toleransi pembulatan 2 desimal (numeric(15,2))

/**
 * Gerbang terakhir sebelum jurnal jadi permanen & bernomor. Re-validasi semuanya
 * di sini (bukan cuma percaya validasi saat baris ditambahkan) — posting adalah
 * satu-satunya titik yang benar-benar tidak boleh salah, sesuai Fase 3 Bagian 2
 * Langkah 2: "validasi balance debit=kredit sebelum posting" + "validasi hanya
 * akun is_header=false yang boleh dijurnal — tolak di level aplikasi".
 */
export async function postJournalEntry(
  tx: typeof Db,
  params: { companyId: string; journalEntryId: string; postedBy: string }
): Promise<{ entryNumber: string }> {
  const [entry] = await tx
    .select()
    .from(journalEntries)
    .where(and(eq(journalEntries.id, params.journalEntryId), eq(journalEntries.companyId, params.companyId)));
  if (!entry) throw new JournalError("Jurnal tidak ditemukan.");
  if (entry.status !== "draft") throw new JournalError("Jurnal ini sudah tidak berstatus draft — tidak bisa diposting lagi.");

  const lines = await tx.select().from(journalEntryLines).where(eq(journalEntryLines.journalEntryId, entry.id));
  if (lines.length < 2) throw new JournalError("Jurnal butuh minimal 2 baris (sisi debit dan sisi kredit).");

  const accountIds = [...new Set(lines.map((l) => l.accountId))];
  const accounts = await tx
    .select()
    .from(chartOfAccounts)
    .where(and(eq(chartOfAccounts.companyId, params.companyId), inArray(chartOfAccounts.id, accountIds)));
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  for (const line of lines) {
    const account = accountById.get(line.accountId);
    if (!account || account.isHeader) {
      throw new JournalError(`Salah satu baris jurnal menunjuk akun header (grup) — hanya akun posting yang boleh dijurnal.`);
    }
  }

  const totalDebit = lines.reduce((sum, l) => sum + Number(l.debitAmount), 0);
  const totalCredit = lines.reduce((sum, l) => sum + Number(l.creditAmount), 0);
  if (totalDebit <= 0 || totalCredit <= 0) {
    throw new JournalError("Total debit dan kredit tidak boleh nol.");
  }
  if (Math.abs(totalDebit - totalCredit) > BALANCE_EPSILON) {
    throw new JournalError(`Jurnal tidak balance — total debit ${totalDebit.toFixed(2)} vs total kredit ${totalCredit.toFixed(2)}.`);
  }

  const urut = await getNextFinanceSequenceNumber(tx, { companyId: params.companyId, sequenceType: "jurnal_umum" });
  const postedAt = new Date();
  const entryNumber = formatJournalEntryNumber(urut, postedAt);

  await tx
    .update(journalEntries)
    .set({ status: "posted", entryNumber, postedBy: params.postedBy, postedAt })
    .where(eq(journalEntries.id, entry.id));

  return { entryNumber };
}

export type NewJournalLine = {
  accountId: string;
  debit: number;
  credit: number;
  description?: string | null;
  /** Dimensi rekanan/klien per baris (Item 5b) — untuk penelusuran per rekanan. */
  organizationId?: string | null;
};

/**
 * Buat header + baris jurnal + LANGSUNG posting dalam satu aksi atomik (dipanggil di
 * dalam withTenantContext). Ini pengganti alur draft lama (buat draft → tambah baris →
 * posting terpisah): tidak ada lagi jurnal setengah jadi yang mengendap. Gagal di titik
 * mana pun ⇒ seluruh transaksi rollback. Gate validasi TETAP satu: postJournalEntry
 * (balance, minimal 2 baris, hanya akun posting) — tidak ada jalur validasi kedua.
 *
 * Dipakai oleh jurnal manual, jurnal koreksi (correctsEntryId), pembuka transaksi
 * terbuka, dan penyelesaiannya (sourceType/sourceId).
 */
export async function createAndPostJournal(
  tx: typeof Db,
  params: {
    companyId: string;
    entryDate: string;
    description: string;
    userId: string;
    lines: NewJournalLine[];
    correctsEntryId?: string | null;
    sourceType?: string | null;
    sourceId?: string | null;
  }
): Promise<{ journalEntryId: string; entryNumber: string }> {
  // Buang baris kosong (dua sisi nol); tiap baris berisi hanya boleh satu sisi.
  const clean = params.lines.filter((l) => l.debit > 0 || l.credit > 0);
  for (const l of clean) {
    if (l.debit > 0 && l.credit > 0) {
      throw new JournalError("Tiap baris hanya boleh diisi debit ATAU kredit, tidak dua-duanya.");
    }
  }
  if (clean.length < 2) throw new JournalError("Jurnal butuh minimal 2 baris (sisi debit dan sisi kredit).");

  const [entry] = await tx
    .insert(journalEntries)
    .values({
      companyId: params.companyId,
      entryDate: params.entryDate,
      description: params.description,
      createdBy: params.userId,
      correctsEntryId: params.correctsEntryId ?? null,
      sourceType: params.sourceType ?? null,
      sourceId: params.sourceId ?? null,
    })
    .returning();

  const rows: (typeof journalEntryLines.$inferInsert)[] = clean.map((l, i) => ({
    companyId: params.companyId,
    journalEntryId: entry.id,
    accountId: l.accountId,
    lineOrder: i + 1,
    debitAmount: (l.debit > 0 ? l.debit : 0).toFixed(2),
    creditAmount: (l.credit > 0 ? l.credit : 0).toFixed(2),
    description: l.description ?? null,
    organizationId: l.organizationId ?? null,
  }));
  await tx.insert(journalEntryLines).values(rows);

  // postJournalEntry me-revalidasi balance + is_header + status draft (jurnal baru
  // selalu draft by default) sebelum memberi nomor & set posted.
  const { entryNumber } = await postJournalEntry(tx, {
    companyId: params.companyId,
    journalEntryId: entry.id,
    postedBy: params.userId,
  });
  return { journalEntryId: entry.id, entryNumber };
}

/** Satu-satunya cara "membatalkan" jurnal posted — tidak pernah edit in place. */
export async function voidJournalEntry(
  tx: typeof Db,
  params: { companyId: string; journalEntryId: string; voidedBy: string; voidReason: string }
): Promise<void> {
  const [entry] = await tx
    .select()
    .from(journalEntries)
    .where(and(eq(journalEntries.id, params.journalEntryId), eq(journalEntries.companyId, params.companyId)));
  if (!entry) throw new JournalError("Jurnal tidak ditemukan.");
  if (entry.status !== "posted") throw new JournalError("Hanya jurnal berstatus posted yang bisa di-void.");

  await tx
    .update(journalEntries)
    .set({ status: "void", voidedBy: params.voidedBy, voidedAt: new Date(), voidReason: params.voidReason })
    .where(eq(journalEntries.id, entry.id));
}
