import { pgTable, pgEnum, uuid, integer, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { employees } from "./employees";
import { users } from "./users";

// AUDIT-E1: evaluasi kelayakan tahunan per personil (rujukan SOP 5.8).
//
// Istilah "practitioner"/"personil" dipakai di skema & kode — SENGAJA BUKAN
// "auditor", karena sistem ini dipakai 4 perusahaan dengan jenis jasa berbeda
// (SMK3, konsultan, uji riksa/inspeksi). Label yang tampil di UI diambil lewat
// getTerminology(), pola sama dengan AUDIT-E3.

/** Status yang DIHITUNG sistem dari 3 kriteria — belum tentu status final. */
export const practitionerEligibilityStatusEnum = pgEnum("practitioner_eligibility_status", [
  "layak_senior",
  "layak_junior",
  "tidak_layak",
]);

/**
 * Status FINAL setelah review Direktur. Default `pending_review` dan HANYA
 * berubah lewat approval — termasuk saat company belum mengonfigurasi
 * approval_flow sama sekali (fail-closed, lihat lib/hr/practitionerEligibility.ts).
 * `ditolak` dipisah dari `tidak_layak`: yang pertama berarti Direktur menolak
 * usulan sistem, yang kedua berarti sistem menilai tidak layak lalu disetujui.
 */
export const practitionerEligibilityFinalStatusEnum = pgEnum("practitioner_eligibility_final_status", [
  "pending_review",
  "layak_senior",
  "layak_junior",
  "tidak_layak",
  "ditolak",
]);

/** 1 baris per company — pola sama persis cpd_settings. */
export const practitionerEligibilitySettings = pgTable("practitioner_eligibility_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  // Ambang batas jumlah penugasan untuk tier "Layak Senior". Nullable supaya
  // company yang belum mengatur tidak error — pemakainya memberi default sendiri.
  seniorMinAssignments: integer("senior_min_assignments"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("practitioner_eligibility_settings_company_unique").on(table.companyId),
]);

export const practitionerEligibilityEvaluations = pgTable("practitioner_eligibility_evaluations", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  year: integer("year").notNull(),

  // Ketiga kriteria di-SNAPSHOT saat evaluasi dibuat, bukan dihitung ulang saat
  // dibaca: evaluasi adalah bukti kepatuhan pada satu titik waktu, jadi angkanya
  // harus tetap sama walau data penugasan/CPD berubah setelahnya.
  assignmentCount: integer("assignment_count").notNull(),
  everWitnessed: boolean("ever_witnessed").notNull(),
  cpdTargetMet: boolean("cpd_target_met").notNull(),

  proposedStatus: practitionerEligibilityStatusEnum("proposed_status").notNull(),
  finalStatus: practitionerEligibilityFinalStatusEnum("final_status").notNull().default("pending_review"),

  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // Evaluasi dilakukan 1x per tahun per orang (jadwal tetap, bukan ad-hoc).
  unique("practitioner_eligibility_evaluations_company_employee_year_unique").on(
    table.companyId, table.employeeId, table.year
  ),
]);
