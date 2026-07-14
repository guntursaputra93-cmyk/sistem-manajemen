import { pgTable, pgEnum, uuid, integer, numeric, timestamp, unique, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { companies } from "./companies";
import { chartOfAccounts } from "./chartOfAccounts";
import { users } from "./users";

export const bankReconciliationStatusEnum = pgEnum("bank_reconciliation_status", ["draft", "selesai"]);

// Rekonsiliasi Bank (Fase 3 Langkah 9). bank_account_id WAJIB akun posting kelompok
// 112xx — divalidasi app-level di lib/finance/bankReconciliation.ts. book_balance
// dihitung OTOMATIS (closingBalance dari getGeneralLedgerForAccount, Langkah 3) saat
// rekonsiliasi dibuka, BUKAN dihitung ulang manual — kalau mutasi baru masuk setelah
// rekonsiliasi dibuka, admin buka rekonsiliasi baru utk periode berikutnya, bukan
// mengedit book_balance yang sudah tersimpan (snapshot titik-waktu, bukan live query).
export const bankReconciliations = pgTable(
  "bank_reconciliations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    // restrict — konvensi FK finansial (Fase 3 Bagian 0).
    bankAccountId: uuid("bank_account_id").notNull().references(() => chartOfAccounts.id, { onDelete: "restrict" }),
    periodMonth: integer("period_month").notNull(),
    periodYear: integer("period_year").notNull(),
    bookBalance: numeric("book_balance", { precision: 15, scale: 2 }).notNull(),
    // Nullable — diisi manual admin belakangan (rekening koran tidak selalu langsung
    // ada saat rekonsiliasi dibuka), wajib terisi sebelum status bisa jadi 'selesai'.
    statementEndingBalance: numeric("statement_ending_balance", { precision: 15, scale: 2 }),
    status: bankReconciliationStatusEnum("status").notNull().default("draft"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    completedBy: uuid("completed_by").references(() => users.id, { onDelete: "set null" }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // "Satu akun bank + periode yang sama tidak boleh punya lebih dari satu
    // rekonsiliasi aktif" (spesifikasi Langkah 9) — diterjemahkan jadi unique keras:
    // hanya SATU baris rekonsiliasi (draft ATAU selesai) boleh ada per kombinasi ini,
    // bukan "hanya satu yang berstatus draft". Pola sama seperti depreciation_runs
    // (idempotency lapis DB + app-level).
    unique("bank_reconciliations_account_period_unique").on(table.companyId, table.bankAccountId, table.periodMonth, table.periodYear),
    check("bank_reconciliations_month_range", sql`${table.periodMonth} BETWEEN 1 AND 12`),
    check("bank_reconciliations_year_range", sql`${table.periodYear} BETWEEN 2000 AND 2100`),
  ]
);
