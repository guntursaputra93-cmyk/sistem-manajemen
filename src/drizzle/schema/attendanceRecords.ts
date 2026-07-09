import { pgTable, pgEnum, uuid, text, date, timestamp, unique } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { employees } from "./employees";

export const attendanceStatusEnum = pgEnum("attendance_status", ["hadir", "izin", "sakit", "alpha", "cuti"]);

export const attendanceRecords = pgTable("attendance_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  attendanceDate: date("attendance_date").notNull(),
  checkInAt: timestamp("check_in_at", { withTimezone: true }),
  checkOutAt: timestamp("check_out_at", { withTimezone: true }),
  status: attendanceStatusEnum("status").notNull().default("hadir"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("attendance_records_employee_date_unique").on(table.employeeId, table.attendanceDate),
]);
