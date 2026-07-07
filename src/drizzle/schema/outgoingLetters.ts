import { pgTable, pgEnum, uuid, text, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { companies } from "./companies";
import { departments } from "./departments";
import { users } from "./users";

// Sama persis dengan sequenceTypeEnum (letterNumberSequences) — surat keluar &
// nota dinas 1 tabel, dibedakan kategori (lihat spesifikasi Bagian 2.3).
export const outgoingLetterCategoryEnum = pgEnum("outgoing_letter_category", ["surat_keluar", "nota_dinas"]);
export const outgoingLetterStatusEnum = pgEnum("outgoing_letter_status", [
  "draft",
  "menunggu_approval",
  "disetujui",
  "terkirim",
  "ditolak",
]);

export const outgoingLetters = pgTable("outgoing_letters", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  // Penentu counter nomor surat (lihat letterNumberSequences).
  departmentId: uuid("department_id").notNull().references(() => departments.id, { onDelete: "restrict" }),
  letterCategory: outgoingLetterCategoryEnum("letter_category").notNull(),
  // Nullable sampai seluruh approval_steps selesai — lihat finalizeLetterNumber di lib/letters/outgoing.ts.
  letterNumber: text("letter_number"),
  // Menentukan approval_flows mana yang berlaku (companyId + letterCategory=appliesTo + jenisKey).
  jenisKey: text("jenis_key").notNull(),
  // Tujuan eksternal — dipakai kalau letter_category = surat_keluar.
  recipient: text("recipient"),
  // Tujuan internal — dipakai kalau letter_category = nota_dinas, salah satu wajib terisi.
  recipientDepartmentId: uuid("recipient_department_id").references(() => departments.id, { onDelete: "set null" }),
  recipientUserId: uuid("recipient_user_id").references(() => users.id, { onDelete: "set null" }),
  subject: text("subject").notNull(),
  status: outgoingLetterStatusEnum("status").notNull().default("draft"),
  bodyContent: text("body_content"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  finalizedAt: timestamp("finalized_at", { withTimezone: true }),
}, (table) => [
  check(
    "outgoing_letters_nota_dinas_target_required",
    sql`${table.letterCategory} <> 'nota_dinas' OR (${table.recipientDepartmentId} IS NOT NULL OR ${table.recipientUserId} IS NOT NULL)`
  ),
]);
