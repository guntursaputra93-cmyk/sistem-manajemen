import { sql } from "drizzle-orm";
import type { db as Db } from "@/lib/db";

/**
 * Nomor urut case berikutnya, atomik lewat INSERT ... ON CONFLICT ... DO UPDATE
 * (pola PERSIS getNextAgendaNumber di lib/letters/agenda.ts) — kuncinya company+year,
 * dan reset setiap tahun karena baris counter untuk tahun baru belum ada -> mulai
 * lagi dari 1. Postgres mengunci baris yang kena conflict sebelum menghitung
 * increment-nya, jadi 2 request bersamaan untuk company+year yang sama pasti dapat
 * nomor berbeda — tidak butuh SELECT ... FOR UPDATE terpisah.
 *
 * Panggil `tx` yang sudah punya tenant context (withTenantContext) supaya tunduk RLS.
 */
export async function getNextCaseSequenceNumber(tx: typeof Db, params: { companyId: string; year: number }): Promise<number> {
  const rows = await tx.execute<{ current_number: number }>(sql`
    INSERT INTO case_number_sequences (company_id, year, current_number)
    VALUES (${params.companyId}, ${params.year}, 1)
    ON CONFLICT (company_id, year)
    DO UPDATE SET current_number = case_number_sequences.current_number + 1, updated_at = now()
    RETURNING current_number
  `);
  return Number(rows[0].current_number);
}

/** Format "CASE/2026/0001" — prefix / tahun / urut 4-digit nol. */
export function formatCaseNumber(year: number, number: number): string {
  return `CASE/${year}/${String(number).padStart(4, "0")}`;
}
