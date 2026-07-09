import { pgTable, pgEnum, uuid, text, date, integer, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { companies } from "./companies";
import { employees } from "./employees";
import { leaveTypes } from "./leaveTypes";
import { users } from "./users";

export const leaveRequestStatusEnum = pgEnum("leave_request_status", ["pending", "approved", "rejected", "cancelled"]);

export const leaveRequests = pgTable("leave_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  leaveTypeId: uuid("leave_type_id").notNull().references(() => leaveTypes.id, { onDelete: "restrict" }),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  // Jumlah hari kalender inklusif — tidak mengecualikan akhir pekan (tidak ada
  // tabel hari libur di codebase ini, di luar scope Fase 2, lihat rencana implementasi).
  totalDays: integer("total_days").notNull(),
  reason: text("reason"),
  status: leaveRequestStatusEnum("status").notNull().default("pending"),
  approverId: uuid("approver_id").references(() => users.id, { onDelete: "set null" }),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  catatan: text("catatan"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("leave_requests_end_after_start", sql`${table.endDate} >= ${table.startDate}`),
]);
