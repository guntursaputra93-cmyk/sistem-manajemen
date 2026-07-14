import { pgTable, uuid, date, numeric, text, timestamp, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { companies } from "./companies";
import { arInvoices } from "./arInvoices";
import { chartOfAccounts } from "./chartOfAccounts";
import { journalEntries } from "./journalEntries";
import { users } from "./users";

// Pembayaran AR (Fase 3 Langkah 4). TIDAK ada status draft/posted terpisah seperti
// journal_entries — mencatat payment adalah satu aksi langsung yang SEKALIGUS
// membuat & memposting jurnalnya (lib/finance/ar.ts recordPayment), makanya
// journalEntryId notNull (beda dari arInvoices.journalEntryId yang nullable selama
// draft). Tidak ada void/edit payment di langkah ini (di luar scope Langkah 4) —
// koreksi kesalahan pencatatan payment ditangani lewat jurnal koreksi manual biasa.
export const arPayments = pgTable(
  "ar_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    // restrict — konvensi FK finansial (Fase 3 Bagian 0), invoice yg sudah ada pembayaran tidak boleh terhapus.
    invoiceId: uuid("invoice_id").notNull().references(() => arInvoices.id, { onDelete: "restrict" }),
    paymentDate: date("payment_date").notNull(),
    amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
    // Akun bank (harus 112xx posting, divalidasi app-level di lib/finance/ar.ts)
    // dipilih saat mencatat payment — sisi Debit jurnal payment.
    bankAccountId: uuid("bank_account_id").notNull().references(() => chartOfAccounts.id, { onDelete: "restrict" }),
    referenceNote: text("reference_note"),
    journalEntryId: uuid("journal_entry_id").notNull().references(() => journalEntries.id, { onDelete: "restrict" }),
    recordedBy: uuid("recorded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("ar_payments_invoice_idx").on(table.invoiceId),
    check("ar_payments_amount_positive", sql`${table.amount} > 0`),
  ]
);
