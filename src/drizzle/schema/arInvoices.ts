import { pgTable, pgEnum, uuid, text, date, numeric, timestamp, unique, check, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { companies } from "./companies";
import { contracts } from "./contracts";
import { chartOfAccounts } from "./chartOfAccounts";
import { journalEntries } from "./journalEntries";
import { users } from "./users";

// jatuh_tempo TIDAK exclusive terhadap sebagian secara nominal (invoice bisa sebagian
// dibayar TAPI sudah lewat jatuh tempo) — precedence dihitung app-level (lihat
// lib/finance/ar.ts recalculateInvoiceStatus): lunas > jatuh_tempo > sebagian > belum_dibayar.
export const arInvoiceStatusEnum = pgEnum("ar_invoice_status", ["draft", "belum_dibayar", "sebagian", "lunas", "jatuh_tempo"]);

// Invoice AR (Fase 3 Langkah 4). Klien & nilai kontrak TIDAK diketik ulang — diambil
// langsung dari contracts (CRM) lewat contractId, invoice cuma nyimpan nominal invoice
// ini sendiri (bisa termin sebagian dari contractValue, makanya amount kolom sendiri,
// bukan salinan contractValue).
export const arInvoices = pgTable(
  "ar_invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    // restrict — konvensi FK finansial (Fase 3 Bagian 0), kontrak yg sudah punya invoice tidak boleh terhapus.
    contractId: uuid("contract_id").notNull().references(() => contracts.id, { onDelete: "restrict" }),
    // NULL selagi draft, diisi getNextFinanceSequenceNumber (sequenceType 'invoice')
    // HANYA saat posting — pola identik journalEntries.entryNumber, supaya draft yang
    // dibatalkan tidak pernah menghabiskan nomor urut (tidak ada nomor bolong).
    invoiceNumber: text("invoice_number"),
    invoiceDate: date("invoice_date").notNull(),
    dueDate: date("due_date").notNull(),
    amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
    // Akun pendapatan (level 3 posting) dipilih admin saat membuat invoice, BUKAN
    // di-hardcode satu akun — validasi is_header=false & account_type='pendapatan'
    // app-level di lib/finance/ar.ts, sama pola dengan validasi journal_entry_lines.
    revenueAccountId: uuid("revenue_account_id").notNull().references(() => chartOfAccounts.id, { onDelete: "restrict" }),
    description: text("description"),
    status: arInvoiceStatusEnum("status").notNull().default("draft"),
    // Jurnal Debit 11301 Piutang Usaha / Kredit revenue_account_id, dibuat otomatis
    // saat posting (lib/finance/ar.ts postInvoice) — restrict: jurnal invoice tidak
    // pernah dihapus selama invoice masih ada (jurnal sendiri juga tidak pernah
    // dihapus, hanya void, sama seperti journal_entries pada umumnya).
    journalEntryId: uuid("journal_entry_id").references(() => journalEntries.id, { onDelete: "restrict" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    postedBy: uuid("posted_by").references(() => users.id, { onDelete: "set null" }),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("ar_invoices_company_invoice_number_unique").on(table.companyId, table.invoiceNumber),
    index("ar_invoices_company_status_idx").on(table.companyId, table.status),
    index("ar_invoices_contract_idx").on(table.contractId),
    check("ar_invoices_amount_positive", sql`${table.amount} > 0`),
  ]
);
