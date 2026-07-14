import { pgTable, uuid, numeric, text, integer, timestamp, check, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { companies } from "./companies";
import { journalEntries } from "./journalEntries";
import { chartOfAccounts } from "./chartOfAccounts";

// companyId didupliksi di sini (bisa di-join lewat journalEntryId) — pola sama
// seperti payslips.companyId/payrollRunId: tiap tabel punya company_id sendiri
// supaya RLS tenant-isolation tidak pernah bergantung pada JOIN.
export const journalEntryLines = pgTable(
  "journal_entry_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    journalEntryId: uuid("journal_entry_id").notNull().references(() => journalEntries.id, { onDelete: "cascade" }),
    // restrict — akun yang sudah dipakai jurnal tidak boleh terhapus (menutup guard
    // "tidak boleh hapus akun yang sudah dipakai jurnal" dari Langkah 1 keuangan/akun/actions.ts,
    // tanpa kode tambahan apa pun di sana — begitu FK ini ada, Postgres yang menahan).
    accountId: uuid("account_id").notNull().references(() => chartOfAccounts.id, { onDelete: "restrict" }),
    lineOrder: integer("line_order").notNull(),
    debitAmount: numeric("debit_amount", { precision: 15, scale: 2 }).notNull().default("0"),
    creditAmount: numeric("credit_amount", { precision: 15, scale: 2 }).notNull().default("0"),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("journal_entry_lines_entry_idx").on(table.journalEntryId),
    check("journal_entry_lines_amounts_nonneg", sql`${table.debitAmount} >= 0 AND ${table.creditAmount} >= 0`),
    // Satu baris = satu sisi (debit ATAU kredit, tidak dua-duanya, tidak nol dua-duanya)
    // — konvensi double-entry standar, defense-in-depth di bawah validasi balance app-level.
    check(
      "journal_entry_lines_exactly_one_side",
      sql`(${table.debitAmount} > 0 AND ${table.creditAmount} = 0) OR (${table.creditAmount} > 0 AND ${table.debitAmount} = 0)`
    ),
  ]
);
