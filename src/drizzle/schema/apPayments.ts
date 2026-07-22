import { pgTable, uuid, date, numeric, text, timestamp, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { companies } from "./companies";
import { apBills } from "./apBills";
import { chartOfAccounts } from "./chartOfAccounts";
import { journalEntries } from "./journalEntries";
import { users } from "./users";

// Pembayaran hutang ke pemasok — cerminan ar_payments. TIDAK ada status draft:
// mencatat pembayaran adalah satu aksi yang SEKALIGUS membuat & memposting jurnalnya
// (lib/finance/ap.ts recordApPayment), makanya journalEntryId notNull. Tidak ada
// void/edit pembayaran (sama seperti AR) — koreksi lewat jurnal manual biasa.
export const apPayments = pgTable(
  "ap_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    // restrict — tagihan yang sudah ada pembayarannya tidak boleh terhapus.
    billId: uuid("bill_id").notNull().references(() => apBills.id, { onDelete: "restrict" }),
    paymentDate: date("payment_date").notNull(),
    amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
    // Akun bank/kas yang DIKREDIT saat membayar (kebalikan AR yang mendebit bank).
    bankAccountId: uuid("bank_account_id").notNull().references(() => chartOfAccounts.id, { onDelete: "restrict" }),
    referenceNote: text("reference_note"),
    journalEntryId: uuid("journal_entry_id").notNull().references(() => journalEntries.id, { onDelete: "restrict" }),
    recordedBy: uuid("recorded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("ap_payments_bill_idx").on(table.billId),
    check("ap_payments_amount_positive", sql`${table.amount} > 0`),
  ]
);
