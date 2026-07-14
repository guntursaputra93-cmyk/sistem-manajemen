import { pgTable, uuid, date, numeric, text, timestamp, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { companies } from "./companies";
import { contracts } from "./contracts";
import { chartOfAccounts } from "./chartOfAccounts";
import { journalEntries } from "./journalEntries";
import { users } from "./users";

// Biaya langsung proyek (Fase 3 Langkah 5), SELALU terkait 1 contract_id — biaya
// overhead/umum yang TIDAK terkait proyek tertentu tetap dijurnal manual biasa lewat
// modul jurnal umum (Langkah 2), bukan lewat tabel ini. Sama seperti ar_payments,
// TIDAK ada status draft/posted terpisah — mencatat biaya adalah satu aksi langsung
// yang sekaligus membuat & memposting jurnalnya (lib/finance/hpp.ts recordProjectCost).
//
// offset_account_id (sisi Kredit) SENGAJA bebas dipilih dari akun posting manapun —
// BUKAN dihardcode ke akun bank saja — supaya biaya proyek bisa dicatat baik yang
// langsung dibayar tunai/bank (Kredit 112xx) MAUPUN yang masih terutang/accrued
// (Kredit 211xx Utang Usaha/Utang Honor dst.), pola fleksibilitas sama seperti
// revenue_account_id di ar_invoices (Langkah 4) — "jangan hardcode satu akun".
export const hppProjectCosts = pgTable(
  "hpp_project_costs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    // restrict — konvensi FK finansial (Fase 3 Bagian 0), kontrak yg sudah punya biaya tidak boleh terhapus.
    contractId: uuid("contract_id").notNull().references(() => contracts.id, { onDelete: "restrict" }),
    costDate: date("cost_date").notNull(),
    // Akun HPP (level 3 posting, account_type='hpp') dipilih saat mencatat biaya —
    // divalidasi app-level di lib/finance/hpp.ts, sama pola dgn validasi journal_entry_lines.
    hppAccountId: uuid("hpp_account_id").notNull().references(() => chartOfAccounts.id, { onDelete: "restrict" }),
    offsetAccountId: uuid("offset_account_id").notNull().references(() => chartOfAccounts.id, { onDelete: "restrict" }),
    amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
    description: text("description"),
    journalEntryId: uuid("journal_entry_id").notNull().references(() => journalEntries.id, { onDelete: "restrict" }),
    recordedBy: uuid("recorded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("hpp_project_costs_contract_idx").on(table.contractId),
    index("hpp_project_costs_company_idx").on(table.companyId),
    check("hpp_project_costs_amount_positive", sql`${table.amount} > 0`),
  ]
);
