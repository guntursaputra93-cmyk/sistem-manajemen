import { pgTable, pgEnum, uuid, text, date, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { employees } from "./employees";
import { attachments } from "./attachments";
import { users } from "./users";

export const cpdActivityCategoryEnum = pgEnum("cpd_activity_category", ["internal", "eksternal"]);

// Logbook CPD (Continuing Professional Development) per karyawan — SOP Pemeliharaan
// Kompetensi Auditor. activityDate nullable: sebagian pelatihan multi-hari dicatat
// tanpa tanggal presisi, tapi `year` tetap wajib diisi supaya rekap tahunan (vs target
// di cpd_settings) tidak bergantung pada activityDate yang mungkin kosong.
//
// attachmentId WAJIB (NOT NULL) — persyaratan Kemnaker, aktivitas CPD tanpa bukti PDF
// tidak boleh tercatat sama sekali (keputusan eksekusi, bukan validasi teknis semata).
// onDelete restrict (bukan set null seperti sebelumnya) — set null akan melanggar
// NOT NULL kalau attachment-nya dihapus, jadi hapus attachment yang masih dirujuk
// harus ditolak DB, bukan diam-diam mengosongkan bukti aktivitas yang sudah tercatat.
export const cpdActivities = pgTable("cpd_activities", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  activityDate: date("activity_date"),
  activityName: text("activity_name").notNull(),
  category: cpdActivityCategoryEnum("category").notNull(),
  organizer: text("organizer"),
  durationHours: numeric("duration_hours", { precision: 5, scale: 2 }).notNull(),
  attachmentId: uuid("attachment_id").notNull().references(() => attachments.id, { onDelete: "restrict" }),
  year: integer("year").notNull(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
