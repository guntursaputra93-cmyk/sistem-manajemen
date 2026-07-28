import { pgTable, uuid, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies";

export const auditTrails = pgTable("audit_trails", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Nullable: percobaan login gagal untuk email yang TIDAK terdaftar tidak
  // punya company_id yang bisa dirujuk (belum tahu itu email siapa).
  //
  // onDelete RESTRICT (dulu SET NULL): sejak audit_trails append-only (0100),
  // SET NULL tidak bisa lagi dijalankan saat company dihapus — trigger menolak
  // `UPDATE audit_trails SET company_id = NULL`, sehingga company yang punya
  // jejak audit terblokir dengan pesan error yang menyesatkan (seolah soal
  // append-only, padahal intinya company tidak boleh dihapus). RESTRICT membuat
  // larangan itu EKSPLISIT dan pesannya tepat. Beda dari user_id yang FK-nya
  // dilepas (0102): company adalah tenant produksi yang memang tidak pernah
  // dihapus, jadi di sini yang dibutuhkan larangan tegas, bukan kelonggaran.
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "restrict" }),
  // Nullable: aksi sistem (bukan aksi user tertentu) atau login gagal untuk email tak dikenal.
  //
  // SENGAJA TANPA FK ke users (pola sama dengan entityId di bawah). Dulu FK-nya
  // ON DELETE SET NULL, tapi sejak audit_trails jadi append-only (migrasi 0100)
  // Postgres tidak bisa lagi menjalankan `UPDATE audit_trails SET user_id = NULL`
  // saat user dihapus — trigger memblokirnya, sehingga user yang pernah login
  // menjadi MUSTAHIL dihapus. Melepas FK menyelesaikan itu sekaligus memperkuat
  // jejak audit: id aktor tetap terekam selamanya, tidak ikut hilang saat user
  // dihapus. Konsekuensi yang diterima: tidak ada referential integrity di sini,
  // jadi user_id bisa menunjuk user yang sudah tidak ada — itu memang wajar untuk
  // catatan historis (yang dicatat adalah "siapa saat itu", bukan relasi hidup).
  userId: uuid("user_id"),
  action: text("action").notNull(),
  entityType: text("entity_type"),
  entityId: uuid("entity_id"),
  metadata: jsonb("metadata"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // Backlog performa — companyId difilter tiap kali halaman audit trail per-company
  // dibuka (VIEW_AUDIT_TRAIL), createdAt dipakai utk query rentang waktu/urutan
  // terbaru (termasuk oleh super_admin lintas company, jadi index terpisah, bukan
  // digabung 1 composite dengan companyId).
  index("audit_trails_company_id_idx").on(table.companyId),
  index("audit_trails_created_at_idx").on(table.createdAt),
  index("audit_trails_user_id_idx").on(table.userId),
]);
