import { pgTable, uuid, date, numeric, timestamp, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { companies } from "./companies";
import { employees } from "./employees";
import { salaryComponents } from "./salaryComponents";
import { users } from "./users";

// Berbeda dari position_history: 1 karyawan bisa punya BEBERAPA baris aktif
// bersamaan (gaji pokok + tunjangan + potongan BPJS dst berlaku di periode yang
// sama) — jadi TIDAK ada partial-unique-index "1 aktif per employee" di sini,
// validitas cukup filter rentang tanggal saat generate payslip (lihat
// generatePayslipsForRun di lib/hr/payroll.ts).
export const employeeSalaryStructures = pgTable("employee_salary_structures", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  salaryComponentId: uuid("salary_component_id").notNull().references(() => salaryComponents.id, { onDelete: "restrict" }),
  // Nama kolom sengaja "salaryAmount" (bukan "amount" polos seperti spec awal) —
  // supaya tertangkap pola redaksi PII di lib/sentry/scrub.ts (token "salary"),
  // tanpa perlu menambah token generik "amount" yang akan over-match kolom nilai
  // di modul lain (CRM dst).
  salaryAmount: numeric("salary_amount", { precision: 15, scale: 2 }).notNull(),
  effectiveDate: date("effective_date").notNull(),
  endDate: date("end_date"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("employee_salary_structures_employee_component_idx").on(table.employeeId, table.salaryComponentId, table.effectiveDate),
  check("employee_salary_structures_end_after_effective", sql`${table.endDate} IS NULL OR ${table.endDate} >= ${table.effectiveDate}`),
]);
