import { pgTable, uuid, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { cases } from "./cases";
import { serviceAssignments } from "./serviceAssignments";

// Junction case <-> service_assignments: satu case bisa punya >1 penugasan.
// Menautkan penugasan yang sudah ada (Fase 4) ke case, bukan menduplikasinya.
export const caseServiceAssignments = pgTable("case_service_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  caseId: uuid("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
  assignmentId: uuid("assignment_id").notNull().references(() => serviceAssignments.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("case_service_assignments_company_id_idx").on(table.companyId),
  index("case_service_assignments_case_id_idx").on(table.caseId),
  index("case_service_assignments_assignment_id_idx").on(table.assignmentId),
]);
