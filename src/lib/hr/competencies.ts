import { and, eq, isNotNull, lt, gte, lte, sql } from "drizzle-orm";
import type { db as Db } from "@/lib/db";
import { employeeCompetencies } from "@/drizzle/schema";

/**
 * Recompute status dari expiresAt — HANYA mengubah baris 'aktif' yang sudah lewat
 * expiresAt menjadi 'kedaluwarsa'. TIDAK PERNAH menyentuh baris 'proses_perpanjangan'
 * (status itu murni manual, diset admin lewat form saat sertifikasi sedang
 * diperpanjang — lihat komentar di drizzle/schema/employeeCompetencies.ts).
 * Dipanggil di awal setiap halaman kompetensi, pola persis expireOverdueDocumentVersions.
 */
export async function expireOverdueEmployeeCompetencies(tx: typeof Db, params: { companyId: string }): Promise<void> {
  await tx
    .update(employeeCompetencies)
    .set({ status: "kedaluwarsa", updatedAt: new Date() })
    .where(
      and(
        eq(employeeCompetencies.companyId, params.companyId),
        eq(employeeCompetencies.status, "aktif"),
        isNotNull(employeeCompetencies.expiresAt),
        lt(employeeCompetencies.expiresAt, sql`CURRENT_DATE`)
      )
    );
}

/**
 * Kompetensi 'aktif' yang expiresAt-nya jatuh dalam <= withinMonths bulan ke depan
 * (default 3, sesuai SOP Pemeliharaan Kompetensi Auditor) — dipakai untuk reminder.
 */
export async function getExpiringCompetencies(tx: typeof Db, params: { companyId: string; withinMonths?: number }) {
  const months = params.withinMonths ?? 3;
  return tx
    .select()
    .from(employeeCompetencies)
    .where(
      and(
        eq(employeeCompetencies.companyId, params.companyId),
        eq(employeeCompetencies.status, "aktif"),
        isNotNull(employeeCompetencies.expiresAt),
        gte(employeeCompetencies.expiresAt, sql`CURRENT_DATE`),
        lte(employeeCompetencies.expiresAt, sql`CURRENT_DATE + (${months} || ' months')::interval`)
      )
    );
}
