import { and, desc, eq, gte, lt, isNotNull, sql } from "drizzle-orm";
import { auditTrails, users } from "@/drizzle/schema";
import { type db as Db } from "@/lib/db";
import { PAGE_SIZE, offsetFor } from "@/lib/pagination";

// Lapisan baca untuk Laporan Audit Trail (Item D). MURNI READ-ONLY — tidak ada
// satu pun operasi tulis di file ini; audit_trails memang append-only (migrasi
// 0100) sehingga UPDATE/DELETE akan ditolak database sekalipun dicoba.

export type AuditTrailFilter = {
  companyId: string;
  /** YYYY-MM-DD, inklusif. WAJIB — tanpa batas tanggal query bisa memindai seluruh tabel. */
  from: string;
  /** YYYY-MM-DD, inklusif (dikonversi jadi < hari berikutnya). WAJIB. */
  to: string;
  entityType?: string | null;
  entityId?: string | null;
  userId?: string | null;
};

export type AuditTrailReportRow = {
  id: string;
  createdAt: Date;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: unknown;
  ipAddress: string | null;
  userId: string | null;
  /** Nama pelaku saat ini. null kalau user sudah dihapus — lihat catatan di bawah. */
  actorName: string | null;
  actorEmail: string | null;
};

/**
 * Zona waktu laporan. created_at bertipe timestamptz dan DB berjalan di UTC,
 * tapi tanggal yang diketik user di form adalah tanggal WIB. Tanpa konversi ini,
 * peristiwa pukul 06:00 WIB (= 23:00 UTC hari sebelumnya) akan jatuh ke tanggal
 * yang salah dan HILANG dari laporan — cacat yang fatal untuk dokumen audit.
 *
 * Offset ditulis literal "+07:00" karena Indonesia tidak mengenal DST, jadi
 * konversinya pasti dan tidak butuh library timezone.
 */
export const REPORT_TZ_OFFSET = "+07:00";
export const REPORT_TZ_LABEL = "WIB";
export const REPORT_TIME_ZONE = "Asia/Jakarta";

/** Awal hari `from` dalam WIB, dinyatakan sebagai instant UTC. */
function inclusiveLowerBound(from: string): Date {
  return new Date(`${from}T00:00:00.000${REPORT_TZ_OFFSET}`);
}

/**
 * Batas atas EKSKLUSIF: awal hari berikutnya setelah `to` dalam WIB. Dipakai
 * `< to+1hari` (bukan `<= to`) supaya seluruh jam di hari `to` ikut terjaring.
 */
function exclusiveUpperBound(to: string): Date {
  const d = new Date(`${to}T00:00:00.000${REPORT_TZ_OFFSET}`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

function buildConditions(filter: AuditTrailFilter) {
  // company_id + rentang created_at SELALU ada — keduanya ter-index dan
  // merupakan pembatas utama yang menjaga query tetap ringan.
  const conditions = [
    eq(auditTrails.companyId, filter.companyId),
    gte(auditTrails.createdAt, inclusiveLowerBound(filter.from)),
    lt(auditTrails.createdAt, exclusiveUpperBound(filter.to)),
  ];
  if (filter.entityType) conditions.push(eq(auditTrails.entityType, filter.entityType));
  if (filter.entityId) conditions.push(eq(auditTrails.entityId, filter.entityId));
  if (filter.userId) conditions.push(eq(auditTrails.userId, filter.userId));
  return and(...conditions);
}

/**
 * Satu halaman hasil laporan, sudah di-join ke users untuk nama pelaku.
 *
 * LEFT JOIN (bukan inner) disengaja: sejak FK user_id dilepas (migrasi 0102),
 * user_id di baris audit tetap terisi meski usernya sudah dihapus — justru itu
 * tujuannya. Inner join akan MENGHILANGKAN baris-baris tersebut dari laporan,
 * yang persis kebalikan dari yang diinginkan auditor.
 */
export async function getAuditTrailPage(
  tx: typeof Db,
  filter: AuditTrailFilter,
  page: number
): Promise<{ rows: AuditTrailReportRow[]; total: number }> {
  const where = buildConditions(filter);

  const [rows, [{ count }]] = await Promise.all([
    tx
      .select({
        id: auditTrails.id,
        createdAt: auditTrails.createdAt,
        action: auditTrails.action,
        entityType: auditTrails.entityType,
        entityId: auditTrails.entityId,
        metadata: auditTrails.metadata,
        ipAddress: auditTrails.ipAddress,
        userId: auditTrails.userId,
        actorName: users.fullName,
        actorEmail: users.email,
      })
      .from(auditTrails)
      .leftJoin(users, eq(users.id, auditTrails.userId))
      .where(where)
      .orderBy(desc(auditTrails.createdAt))
      .limit(PAGE_SIZE)
      .offset(offsetFor(page)),
    tx.select({ count: sql<number>`count(*)::int` }).from(auditTrails).where(where),
  ]);

  return { rows: rows as AuditTrailReportRow[], total: count };
}

/**
 * Seluruh baris untuk rentang & filter yang sama, TANPA pagination — khusus
 * export CSV supaya file yang diserahkan ke auditor berisi data lengkap, bukan
 * cuma halaman yang sedang dilihat.
 *
 * Dibatasi EXPORT_MAX_ROWS sebagai rem pengaman: tanpa batas, rentang tanggal
 * yang lebar pada tabel besar bisa membekukan server saat merangkai data URI.
 * Kalau batas ini kena, halaman memberi tahu user untuk mempersempit rentang —
 * BUKAN diam-diam memotong data (laporan audit yang terpotong tanpa peringatan
 * lebih berbahaya daripada tidak ada laporan).
 */
export const EXPORT_MAX_ROWS = 5000;

export async function getAuditTrailForExport(
  tx: typeof Db,
  filter: AuditTrailFilter
): Promise<{ rows: AuditTrailReportRow[]; truncated: boolean }> {
  const rows = await tx
    .select({
      id: auditTrails.id,
      createdAt: auditTrails.createdAt,
      action: auditTrails.action,
      entityType: auditTrails.entityType,
      entityId: auditTrails.entityId,
      metadata: auditTrails.metadata,
      ipAddress: auditTrails.ipAddress,
      userId: auditTrails.userId,
      actorName: users.fullName,
      actorEmail: users.email,
    })
    .from(auditTrails)
    .leftJoin(users, eq(users.id, auditTrails.userId))
    .where(buildConditions(filter))
    .orderBy(desc(auditTrails.createdAt))
    .limit(EXPORT_MAX_ROWS + 1);

  return {
    rows: (rows.slice(0, EXPORT_MAX_ROWS) as AuditTrailReportRow[]),
    truncated: rows.length > EXPORT_MAX_ROWS,
  };
}

/** Nilai entity_type yang BENAR-BENAR ada di data company ini — dropdown filter
 * dibangun dari sini, bukan dari daftar hardcode yang gampang basi. */
export async function getDistinctEntityTypes(tx: typeof Db, companyId: string): Promise<string[]> {
  const rows = await tx
    .selectDistinct({ entityType: auditTrails.entityType })
    .from(auditTrails)
    .where(and(eq(auditTrails.companyId, companyId), isNotNull(auditTrails.entityType)))
    .orderBy(auditTrails.entityType);
  return rows.map((r) => r.entityType).filter((t): t is string => Boolean(t));
}

/** Ringkasan metadata untuk kolom tabel — dipadatkan jadi `key=value` agar
 * terbaca sekilas; CSV tetap membawa JSON utuh supaya tidak ada yang hilang. */
export function summarizeMetadata(metadata: unknown, maxLength = 90): string {
  if (metadata === null || metadata === undefined) return "—";
  if (typeof metadata !== "object") return String(metadata);
  const parts = Object.entries(metadata as Record<string, unknown>)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
  if (parts.length === 0) return "—";
  const joined = parts.join(", ");
  return joined.length > maxLength ? `${joined.slice(0, maxLength - 1)}…` : joined;
}
