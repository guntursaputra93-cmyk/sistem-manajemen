import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { serviceAssignments } from "./serviceAssignments";
import { employees } from "./employees";

// Anggota tim TAMBAHAN di luar personil utama (service_assignments.employeeId) —
// dipakai kalau 1 penugasan butuh >1 auditor (mis. Ketua Tim + Anggota). Selalu
// karyawan internal terdaftar (beda dari calibration_attendees yang bisa asesor
// eksternal) — employeeId wajib, tidak ada fallback nama bebas.
export const serviceAssignmentTeam = pgTable("service_assignment_team", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  assignmentId: uuid("assignment_id").notNull().references(() => serviceAssignments.id, { onDelete: "cascade" }),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  roleInTeam: text("role_in_team"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // Backlog performa — assignmentId difilter di halaman detail penugasan
  // (daftar tim), employeeId dipakai getAnnualAuditExperience.
  index("service_assignment_team_company_id_idx").on(table.companyId),
  index("service_assignment_team_assignment_id_idx").on(table.assignmentId),
  index("service_assignment_team_employee_id_idx").on(table.employeeId),
]);
