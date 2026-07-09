import { pgTable, pgEnum, uuid, text, date, timestamp } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { employees } from "./employees";
import { departments } from "./departments";
import { users } from "./users";

export const positionHistoryStatusEnum = pgEnum("position_history_status", ["active", "superseded"]);
export const positionHistoryChangeTypeEnum = pgEnum("position_history_change_type", ["awal", "promosi", "demosi", "mutasi"]);

export const positionHistory = pgTable("position_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  positionTitle: text("position_title").notNull(),
  departmentId: uuid("department_id").references(() => departments.id, { onDelete: "set null" }),
  jobLevel: text("job_level"),
  changeType: positionHistoryChangeTypeEnum("change_type").notNull().default("awal"),
  notes: text("notes"),
  status: positionHistoryStatusEnum("status").notNull().default("active"),
  effectiveDate: date("effective_date").notNull(),
  endDate: date("end_date"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Constraint "hanya 1 active per employee_id" ditegakkan via partial unique
  // index di migrasi custom (0035_create_employees_and_position_history.sql) —
  // drizzle-kit generate tidak punya API .where() untuk index parsial di versi ini
  // (pola persis document_versions_one_active_per_document, lihat documentVersions.ts).
});
