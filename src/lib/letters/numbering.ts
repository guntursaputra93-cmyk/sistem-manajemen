import { sql } from "drizzle-orm";
import type { db as Db } from "@/lib/db";

export type SequenceType = "surat_keluar" | "nota_dinas";

export type NextSequenceParams = {
  companyId: string;
  departmentId: string;
  sequenceType: SequenceType;
};

/**
 * Generate nomor urut berikutnya untuk kombinasi company+departemen+jenis,
 * atomik lewat 1 statement INSERT ... ON CONFLICT ... DO UPDATE. Postgres
 * mengunci baris yang kena conflict sebelum menghitung increment-nya, jadi
 * 2 request bersamaan untuk kombinasi yang sama pasti dapat nomor berbeda —
 * tidak butuh SELECT ... FOR UPDATE terpisah di level aplikasi.
 *
 * Panggil `tx` yang sudah punya tenant context (lihat withTenantContext) supaya
 * tunduk RLS seperti query lain.
 */
export async function getNextSequenceNumber(tx: typeof Db, params: NextSequenceParams): Promise<number> {
  const rows = await tx.execute<{ current_number: number }>(sql`
    INSERT INTO letter_number_sequences (company_id, department_id, sequence_type, current_number)
    VALUES (${params.companyId}, ${params.departmentId}, ${params.sequenceType}, 1)
    ON CONFLICT (company_id, department_id, sequence_type)
    DO UPDATE SET current_number = letter_number_sequences.current_number + 1, updated_at = now()
    RETURNING current_number
  `);
  return Number(rows[0].current_number);
}
