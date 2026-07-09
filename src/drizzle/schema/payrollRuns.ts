import { pgTable, pgEnum, uuid, integer, timestamp, unique, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { companies } from "./companies";
import { users } from "./users";

export const payrollRunStatusEnum = pgEnum("payroll_run_status", ["draft", "diproses", "selesai"]);

export const payrollRuns = pgTable("payroll_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  periodMonth: integer("period_month").notNull(),
  periodYear: integer("period_year").notNull(),
  status: payrollRunStatusEnum("status").notNull().default("draft"),
  processedBy: uuid("processed_by").references(() => users.id, { onDelete: "set null" }),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("payroll_runs_company_year_month_unique").on(table.companyId, table.periodYear, table.periodMonth),
  check("payroll_runs_month_range", sql`${table.periodMonth} BETWEEN 1 AND 12`),
]);
