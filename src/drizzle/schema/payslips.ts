import { pgTable, uuid, numeric, jsonb, timestamp, unique } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { payrollRuns } from "./payrollRuns";
import { employees } from "./employees";
import { journalEntries } from "./journalEntries";

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
  // journal_entries sudah ada (Fase 3 Langkah 2) — FK ditambahkan sesuai instruksi
  // Bagian 0 ("tambahkan FK constraint saat tabel journal_entries sudah ada"), TAPI
  // logika pengisiannya MASIH belum diimplementasikan (generatePayslipsForRun tetap
  // selalu set null, lib/hr/payroll.ts TIDAK disentuh sama sekali di langkah ini —
  // itu di luar scope "penambahan baris potongan kasbon" Langkah 8). set null: kalau
  // jurnal yang direferensikan di-void, payslip tidak boleh ikut hilang/gagal delete.
  journalEntryId: uuid("journal_entry_id").references(() => journalEntries.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("payslips_run_employee_unique").on(table.payrollRunId, table.employeeId),
]);
