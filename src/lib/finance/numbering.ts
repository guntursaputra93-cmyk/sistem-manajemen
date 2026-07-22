import { sql } from "drizzle-orm";
import type { db as Db } from "@/lib/db";
import type { financeSequenceTypeEnum } from "@/drizzle/schema";

export type FinanceSequenceType = (typeof financeSequenceTypeEnum.enumValues)[number];

export type NextFinanceSequenceParams = {
  companyId: string;
  sequenceType: FinanceSequenceType;
};

/**
 * Generate nomor urut berikutnya untuk kombinasi company+jenis dokumen finansial,
 * pola atomik sama persis dengan getNextSequenceNumber (lib/letters/numbering.ts) —
 * 1 statement INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING, jadi 2 posting
 * bersamaan pasti dapat nomor berbeda tanpa SELECT ... FOR UPDATE terpisah.
 *
 * Panggil `tx` yang sudah punya tenant context (withTenantContext) supaya tunduk RLS.
 */
export async function getNextFinanceSequenceNumber(tx: typeof Db, params: NextFinanceSequenceParams): Promise<number> {
  const rows = await tx.execute<{ current_number: number }>(sql`
    INSERT INTO finance_number_sequences (company_id, sequence_type, current_number)
    VALUES (${params.companyId}, ${params.sequenceType}, 1)
    ON CONFLICT (company_id, sequence_type)
    DO UPDATE SET current_number = finance_number_sequences.current_number + 1, updated_at = now()
    RETURNING current_number
  `);
  return Number(rows[0].current_number);
}

// Array romawi lokal (bukan diimpor) — lib/letters/outgoing.ts punya array yang sama
// persis tapi tidak diekspor dari modul itu; nilainya trivial (12 elemen tetap),
// tidak sepadan menambah dependensi lintas-modul surat<->keuangan untuk ini.
const ROMAN_MONTHS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

/** Format "JU/000123/VII/2026" — dipanggil saat posting, bukan saat draft dibuat. */
export function formatJournalEntryNumber(urut: number, postedAt: Date): string {
  const urutStr = String(urut).padStart(6, "0");
  const month = ROMAN_MONTHS[postedAt.getMonth()];
  const year = postedAt.getFullYear();
  return `JU/${urutStr}/${month}/${year}`;
}

/** Format "INV/000123/VII/2026" (Langkah 4, AR invoices) — sama polanya dengan jurnal. */
export function formatInvoiceNumber(urut: number, postedAt: Date): string {
  const urutStr = String(urut).padStart(6, "0");
  const month = ROMAN_MONTHS[postedAt.getMonth()];
  const year = postedAt.getFullYear();
  return `INV/${urutStr}/${month}/${year}`;
}

/** Format "BILL/000123/VII/2026" (Item 5c, tagihan pemasok/AP) — pola sama. */
export function formatBillNumber(urut: number, postedAt: Date): string {
  const urutStr = String(urut).padStart(6, "0");
  const month = ROMAN_MONTHS[postedAt.getMonth()];
  const year = postedAt.getFullYear();
  return `BILL/${urutStr}/${month}/${year}`;
}
