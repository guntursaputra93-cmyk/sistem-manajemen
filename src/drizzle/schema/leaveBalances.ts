import { pgTable, uuid, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { companies } from "./companies";
import { employees } from "./employees";
import { leaveTypes } from "./leaveTypes";

export const leaveBalances = pgTable("leave_balances", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  leaveTypeId: uuid("leave_type_id").notNull().references(() => leaveTypes.id, { onDelete: "restrict" }),
  year: integer("year").notNull(),
  quota: integer("quota").notNull(),
  used: integer("used").notNull().default(0),
  // Dihitung otomatis oleh Postgres (bukan trigger, bukan sinkronisasi manual di kode
  // aplikasi) — keputusan Fase 2: konsisten dengan konvensi "tidak ada trigger" di
  // codebase ini, tapi tetap butuh "otomatis" tanpa app-level sync yang bisa lupa.
  // Kolom ini read-only dari sisi TypeScript (drizzle menandainya non-insertable/
  // non-settable secara tipe) — JANGAN PERNAH ditulis manual di .values()/.set().
  remaining: integer("remaining").generatedAlwaysAs(sql`(quota - used)`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("leave_balances_employee_leave_type_year_unique").on(table.employeeId, table.leaveTypeId, table.year),
]);
