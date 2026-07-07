import { sql } from "drizzle-orm";
import type { db as Db } from "@/lib/db";

export type CombinedSuratRow = {
  id: string;
  jenis: "masuk" | "keluar";
  tanggal: string;
  subject: string;
  status: string;
  department_id: string | null;
};

/**
 * Gabungan surat masuk + surat keluar (bukan nota dinas — itu tab terpisah,
 * lihat spesifikasi Bagian 4) untuk tab "Surat Masuk-Keluar". Ditulis raw SQL
 * (UNION ALL) supaya LIMIT/OFFSET beneran jalan di level database untuk 2
 * tabel sekaligus — query builder Drizzle tidak punya cara rapi menyatukan
 * 2 tabel berbeda kolom lalu di-paginate 1 kali.
 */
export async function queryCombinedSuratArchive(
  tx: typeof Db,
  params: {
    companyId: string;
    departmentId: string | null;
    jenis: "masuk" | "keluar" | null;
    dateFrom: string | null;
    dateTo: string | null;
    limit: number;
    offset: number;
  }
): Promise<{ rows: CombinedSuratRow[]; totalCount: number }> {
  const { companyId, departmentId, jenis, dateFrom, dateTo, limit, offset } = params;

  const combined = sql`
    (
      SELECT id, 'masuk' AS jenis, received_date AS tanggal, subject, status::text AS status, department_id
      FROM incoming_letters
      WHERE company_id = ${companyId}
        AND (${departmentId}::uuid IS NULL OR department_id = ${departmentId}::uuid)
        AND (${jenis}::text IS NULL OR ${jenis}::text = 'masuk')
        AND (${dateFrom}::date IS NULL OR received_date >= ${dateFrom}::date)
        AND (${dateTo}::date IS NULL OR received_date <= ${dateTo}::date)
      UNION ALL
      SELECT id, 'keluar' AS jenis, created_at::date AS tanggal, subject, status::text AS status, department_id
      FROM outgoing_letters
      WHERE company_id = ${companyId}
        AND letter_category = 'surat_keluar'
        AND (${departmentId}::uuid IS NULL OR department_id = ${departmentId}::uuid)
        AND (${jenis}::text IS NULL OR ${jenis}::text = 'keluar')
        AND (${dateFrom}::date IS NULL OR created_at::date >= ${dateFrom}::date)
        AND (${dateTo}::date IS NULL OR created_at::date <= ${dateTo}::date)
    )
  `;

  const rows = await tx.execute<CombinedSuratRow>(sql`
    SELECT * FROM ${combined} AS combined
    ORDER BY tanggal DESC
    LIMIT ${limit} OFFSET ${offset}
  `);

  const countRows = await tx.execute<{ count: string }>(sql`SELECT COUNT(*) FROM ${combined} AS combined`);

  return { rows, totalCount: Number(countRows[0].count) };
}
