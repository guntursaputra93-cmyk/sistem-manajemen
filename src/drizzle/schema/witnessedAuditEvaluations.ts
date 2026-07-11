import { pgTable, uuid, date, text, jsonb, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { serviceAssignments } from "./serviceAssignments";
import { employees } from "./employees";

// FR-03 Fase 4: penilaian "witnessed audit" — observer menyaksikan personil bekerja
// di lapangan lalu menilai per-aspek. scores SENGAJA jsonb (array {aspect, score}),
// TIDAK dinormalisasi ke tabel per-aspek (keputusan spesifikasi Bagian 7) — aspek
// default (6, skala 1-4 sesuai SOP) di-hardcode di lib/scheduling/evaluations.ts,
// bukan tabel config terpisah. observerSigned/auditeeSigned pola checklist sama
// seperti calibration_attendees.signed (Fase 2).
export const witnessedAuditEvaluations = pgTable("witnessed_audit_evaluations", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  assignmentId: uuid("assignment_id").notNull().references(() => serviceAssignments.id, { onDelete: "cascade" }),
  observerEmployeeId: uuid("observer_employee_id").notNull().references(() => employees.id, { onDelete: "restrict" }),
  evaluationDate: date("evaluation_date").notNull(),
  scores: jsonb("scores").notNull().default([]),
  feedbackNotes: text("feedback_notes"),
  observerSigned: boolean("observer_signed").notNull().default(false),
  auditeeSigned: boolean("auditee_signed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // Backlog performa — assignmentId difilter di halaman detail penugasan (daftar evaluasi).
  index("witnessed_audit_evaluations_company_id_idx").on(table.companyId),
  index("witnessed_audit_evaluations_assignment_id_idx").on(table.assignmentId),
  index("witnessed_audit_evaluations_observer_employee_id_idx").on(table.observerEmployeeId),
]);
