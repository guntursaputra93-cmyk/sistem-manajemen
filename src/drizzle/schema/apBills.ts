import { pgTable, pgEnum, uuid, text, date, numeric, timestamp, unique, check, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { companies } from "./companies";
import { organizations } from "./organizations";
import { chartOfAccounts } from "./chartOfAccounts";
import { journalEntries } from "./journalEntries";
import { users } from "./users";

// Status dan precedence-nya identik ar_invoice_status (lunas > jatuh_tempo >
// sebagian > belum_dibayar) — dihitung app-level di lib/finance/ap.ts, bukan trigger.
export const apBillStatusEnum = pgEnum("ap_bill_status", ["draft", "belum_dibayar", "sebagian", "lunas", "jatuh_tempo"]);

// Tagihan dari pemasok (AP / Hutang Usaha) — cerminan ar_invoices. Beda utamanya:
// AR menautkan klien lewat contracts (CRM), sedangkan tagihan pemasok tidak punya
// kontrak, jadi rekanannya ditautkan LANGSUNG lewat organization_id (dimensi rekanan
// yang dibangun di Item 5b) — inilah yang membuat hutang & biaya pemasok otomatis
// masuk Kartu Rekanan.
export const apBills = pgTable(
  "ap_bills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    // restrict — konvensi FK finansial: pemasok yang masih punya tagihan tidak boleh dihapus.
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
    // NULL selagi draft, diisi getNextFinanceSequenceNumber (sequenceType 'tagihan')
    // HANYA saat posting — pola identik arInvoices.invoiceNumber, supaya draft yang
    // dibatalkan tidak pernah menghabiskan nomor urut.
    billNumber: text("bill_number"),
    // Nomor faktur dari pemasok (bebas) — untuk rekonsiliasi dengan dokumen vendor.
    supplierRef: text("supplier_ref"),
    billDate: date("bill_date").notNull(),
    dueDate: date("due_date").notNull(),
    amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
    // Akun yang DIDEBIT saat tagihan diposting (biaya/HPP/aset) — dipilih admin,
    // divalidasi app-level (posting, bukan header) sama seperti revenueAccountId di AR.
    expenseAccountId: uuid("expense_account_id").notNull().references(() => chartOfAccounts.id, { onDelete: "restrict" }),
    description: text("description"),
    status: apBillStatusEnum("status").notNull().default("draft"),
    // Jurnal Debit expense_account_id / Kredit 21101 Utang Usaha, dibuat saat posting.
    journalEntryId: uuid("journal_entry_id").references(() => journalEntries.id, { onDelete: "restrict" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    postedBy: uuid("posted_by").references(() => users.id, { onDelete: "set null" }),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("ap_bills_company_bill_number_unique").on(table.companyId, table.billNumber),
    index("ap_bills_company_status_idx").on(table.companyId, table.status),
    index("ap_bills_organization_idx").on(table.organizationId),
    check("ap_bills_amount_positive", sql`${table.amount} > 0`),
  ]
);
