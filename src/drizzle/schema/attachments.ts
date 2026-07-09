import { pgTable, pgEnum, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { users } from "./users";

// Satu tabel dipakai banyak entity (surat masuk, surat keluar, nota dinas, dokumen)
// — lihat spesifikasi Bagian 2.1, supaya lampiran tidak diduplikasi per modul.
export const attachmentEntityTypeEnum = pgEnum("attachment_entity_type", [
  "surat_masuk",
  "surat_keluar",
  "nota_dinas",
  "dokumen",
  // Fase 2 SDM — dokumen kepegawaian, sertifikat kompetensi, bukti CPD.
  "employee",
  "employee_competency",
  "cpd_activity",
]);

export const attachments = pgTable("attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  entityType: attachmentEntityTypeEnum("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  // Path object di Supabase Storage bucket private (bukan URL publik).
  filePath: text("file_path").notNull(),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // Query paling umum: "semua lampiran milik entity X" (mis. 1 surat masuk tertentu).
  index("attachments_entity_idx").on(table.entityType, table.entityId),
]);
