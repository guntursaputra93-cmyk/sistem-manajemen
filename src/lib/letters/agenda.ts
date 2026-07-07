import { sql } from "drizzle-orm";
import type { db as Db } from "@/lib/db";

/**
 * Nomor agenda surat masuk, atomik lewat INSERT ... ON CONFLICT ... DO UPDATE
 * (pola sama seperti getNextSequenceNumber di numbering.ts) — tapi kuncinya
 * company+year (bukan company+department+jenis), dan REHOME setiap tahun
 * karena baris counter untuk tahun baru belum ada -> mulai lagi dari 1.
 */
export async function getNextAgendaNumber(tx: typeof Db, params: { companyId: string; year: number }): Promise<number> {
  const rows = await tx.execute<{ current_number: number }>(sql`
    INSERT INTO agenda_number_sequences (company_id, year, current_number)
    VALUES (${params.companyId}, ${params.year}, 1)
    ON CONFLICT (company_id, year)
    DO UPDATE SET current_number = agenda_number_sequences.current_number + 1, updated_at = now()
    RETURNING current_number
  `);
  return Number(rows[0].current_number);
}

export function formatAgendaNumber(year: number, number: number): string {
  return `AG-${year}-${String(number).padStart(4, "0")}`;
}
