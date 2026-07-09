import { pgTable, uuid, numeric, jsonb, timestamp, unique } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { payrollRuns } from "./payrollRuns";
import { employees } from "./employees";

export const payslips = pgTable("payslips", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  payrollRunId: uuid("payroll_run_id").notNull().references(() => payrollRuns.id, { onDelete: "cascade" }),
  // restrict (bukan cascade): record finansial tidak boleh hilang diam-diam kalau
  // baris employees suatu saat dihapus — pola sama seperti users.companyId.
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "restrict" }),
  // Nama kolom sengaja "grossSalaryAmount"/"salaryDeductions"/"netSalaryAmount"
  // (bukan total_pendapatan/total_potongan/net_pay seperti spec awal) — supaya
  // tertangkap pola redaksi PII (token "salary") di lib/sentry/scrub.ts.
  grossSalaryAmount: numeric("gross_salary_amount", { precision: 15, scale: 2 }).notNull(),
  salaryDeductions: numeric("salary_deductions", { precision: 15, scale: 2 }).notNull(),
  netSalaryAmount: numeric("net_salary_amount", { precision: 15, scale: 2 }).notNull(),
  // Sengaja "payslipDetail" (bukan "detail" polos) — token "payslip" ikut tertangkap
  // redaksi Sentry tanpa perlu token generik "detail" yang akan over-match modul lain.
  payslipDetail: jsonb("payslip_detail").notNull(),
  // Reserved utk integrasi jurnal Fase 3 (Keuangan) — TANPA .references() karena
  // tabel jurnal belum ada, dan logika pengisiannya BELUM diimplementasikan di
  // fase ini (lihat lib/hr/payroll.ts — generatePayslipsForRun selalu set null).
  journalEntryId: uuid("journal_entry_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("payslips_run_employee_unique").on(table.payrollRunId, table.employeeId),
]);
