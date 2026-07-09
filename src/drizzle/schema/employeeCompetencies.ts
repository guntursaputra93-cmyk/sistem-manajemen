import { pgTable, pgEnum, uuid, text, date, timestamp } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { employees } from "./employees";
import { competencyTypes } from "./competencyTypes";
import { attachments } from "./attachments";

// 3 status (bukan 2/aktif-expired seperti draft awal) — sesuai SOP Pemeliharaan
// Kompetensi Auditor: proses_perpanjangan HARUS diset manual oleh admin (bukan
// dihitung dari tanggal apapun), sementara kedaluwarsa tetap dihitung otomatis
// dari expiresAt (lihat expireOverdueEmployeeCompetencies di lib/hr/competencies.ts,
// yang HANYA mengubah aktif->kedaluwarsa, tidak pernah menyentuh proses_perpanjangan).
export const employeeCompetencyStatusEnum = pgEnum("employee_competency_status", [
  "aktif",
  "kedaluwarsa",
  "proses_perpanjangan",
]);

export const employeeCompetencies = pgTable("employee_competencies", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  competencyTypeId: uuid("competency_type_id").notNull().references(() => competencyTypes.id, { onDelete: "restrict" }),
  certificateNumber: text("certificate_number"),
  // Skema sektor/lingkup sertifikasi (mis. "Migas", "Konstruksi") — field khusus SOP
  // Pemeliharaan Kompetensi Auditor, opsional karena tidak semua jenis kompetensi punya skema sektor.
  sectorScheme: text("sector_scheme"),
  issuedDate: date("issued_date"),
  expiresAt: date("expires_at"),
  status: employeeCompetencyStatusEnum("status").notNull().default("aktif"),
  attachmentId: uuid("attachment_id").references(() => attachments.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
