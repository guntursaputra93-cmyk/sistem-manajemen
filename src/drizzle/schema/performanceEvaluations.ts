import { pgTable, uuid, date, text, jsonb, boolean, timestamp } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { serviceAssignments } from "./serviceAssignments";
import { employees } from "./employees";

// FR-04 Fase 4: evaluasi kinerja personil per penugasan, diisi Ketua Tim/Technical
// Manager (evaluatorEmployeeId) — beda dari witnessed_audit_evaluations (FR-03,
// observer menyaksikan langsung di lapangan). scores jsonb sama pola-nya (array
// {aspect, score}, tidak dinormalisasi — keputusan spesifikasi Bagian 7). 2 baris
// tanda tangan: evaluator sendiri + "diketahui oleh" Technical Manager (bukan
// "auditee" seperti FR-03, karena ini evaluasi TOP-DOWN bukan witnessed bersama).
export const performanceEvaluations = pgTable("performance_evaluations", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  assignmentId: uuid("assignment_id").notNull().references(() => serviceAssignments.id, { onDelete: "cascade" }),
  evaluatorEmployeeId: uuid("evaluator_employee_id").notNull().references(() => employees.id, { onDelete: "restrict" }),
  evaluationDate: date("evaluation_date").notNull(),
  scores: jsonb("scores").notNull().default([]),
  conclusionNotes: text("conclusion_notes"),
  evaluatorSigned: boolean("evaluator_signed").notNull().default(false),
  knownByTechnicalManagerSigned: boolean("known_by_technical_manager_signed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
