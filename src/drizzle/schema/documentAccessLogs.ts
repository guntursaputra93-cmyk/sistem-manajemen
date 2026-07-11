import { pgTable, pgEnum, uuid, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { documentVersions } from "./documentVersions";
import { users } from "./users";

export const documentAccessActionEnum = pgEnum("document_access_action", ["view", "download"]);

// Terpisah dari audit_trails (yang untuk aksi mutasi) — ini khusus akses baca,
// volumenya jauh lebih tinggi (lihat spesifikasi Bagian 2.4).
export const documentAccessLogs = pgTable("document_access_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  documentVersionId: uuid("document_version_id").notNull().references(() => documentVersions.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  action: documentAccessActionEnum("action").notNull(),
  accessedAt: timestamp("accessed_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // Wajib (spesifikasi Bagian 2.4) — dipakai tiap kali dashboard/notifikasi belum-dibaca dihitung.
  index("document_access_logs_user_version_idx").on(table.userId, table.documentVersionId),
  // Backlog performa — index composite di atas TIDAK dipakai kalau query cuma
  // filter documentVersionId sendiri tanpa userId (mis. hitung total akses per versi
  // dokumen) — leading column composite itu userId, bukan documentVersionId.
  index("document_access_logs_document_version_id_idx").on(table.documentVersionId),
  index("document_access_logs_company_id_idx").on(table.companyId),
]);
