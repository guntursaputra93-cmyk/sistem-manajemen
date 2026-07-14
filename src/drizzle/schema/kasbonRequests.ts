import { pgTable, pgEnum, uuid, text, date, numeric, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { companies } from "./companies";
import { employees } from "./employees";
import { chartOfAccounts } from "./chartOfAccounts";
import { journalEntries } from "./journalEntries";
import { users } from "./users";

// Tidak ada status "dicairkan" terpisah dari "disetujui" — approve DAN disbursement
// (jurnal Debit 11303 Piutang Karyawan / Kredit akun kas/bank pilihan admin) terjadi
// dalam SATU aksi admin sekaligus (lib/hr/kasbon.ts approveAndDisburseKasbon), karena
// spesifikasi Fase 3 Bagian 2.8 tidak menyebut tahap pencairan terpisah.
export const kasbonRequestStatusEnum = pgEnum("kasbon_request_status", ["pending", "disetujui", "ditolak", "lunas"]);

// Kasbon (Fase 3 Langkah 8) — bagian paling sensitif: employee_id restrict (BUKAN
// cascade seperti leave_requests.employeeId) karena ini record finansial (piutang
// karyawan riil), pola sama persis dengan payslips.employeeId (Fase 3 Bagian 0).
export const kasbonRequests = pgTable(
  "kasbon_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "restrict" }),
    totalAmount: numeric("total_amount", { precision: 15, scale: 2 }).notNull(),
    installmentAmount: numeric("installment_amount", { precision: 15, scale: 2 }).notNull(),
    // Diisi = total_amount saat baris dibuat (belum berarti apa-apa sebelum disetujui),
    // dikurangi lib/hr/payroll.ts finalizePayrollRun tiap payslip berstatus final
    // menyertakan cicilan kasbon ini — lihat komentar di sana.
    remainingBalance: numeric("remaining_balance", { precision: 15, scale: 2 }).notNull(),
    purpose: text("purpose").notNull(),
    requestDate: date("request_date").notNull(),
    status: kasbonRequestStatusEnum("status").notNull().default("pending"),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    // Akun kas/bank dipilih admin saat approve+disburse — TIDAK di-hardcode (pola sama
    // dgn ar_invoices.revenueAccountId/hpp_project_costs.offsetAccountId).
    disbursementAccountId: uuid("disbursement_account_id").references(() => chartOfAccounts.id, { onDelete: "restrict" }),
    // restrict — jurnal disbursement tidak pernah dihapus selama kasbon masih ada.
    journalEntryId: uuid("journal_entry_id").references(() => journalEntries.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("kasbon_requests_total_positive", sql`${table.totalAmount} > 0`),
    check("kasbon_requests_installment_positive", sql`${table.installmentAmount} > 0`),
    check("kasbon_requests_remaining_nonneg", sql`${table.remainingBalance} >= 0`),
    check("kasbon_requests_remaining_lte_total", sql`${table.remainingBalance} <= ${table.totalAmount}`),
  ]
);
