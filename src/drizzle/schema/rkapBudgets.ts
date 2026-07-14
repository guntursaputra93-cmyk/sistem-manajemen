import { pgTable, uuid, integer, numeric, text, timestamp, unique, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { companies } from "./companies";
import { chartOfAccounts } from "./chartOfAccounts";
import { users } from "./users";

// RKAP (Rencana Kerja Anggaran Perusahaan) — anggaran TAHUNAN per akun (Fase 3
// Langkah 6). account_id WAJIB akun posting (is_header=false) bertipe
// pendapatan/hpp/biaya, divalidasi app-level di lib/finance/rkap.ts — RKAP secara
// konsep untuk pos pendapatan & belanja, bukan akun neraca (aset/kewajiban/modal).
// Breakdown bulanan opsional ada di rkap_budget_monthly (tabel terpisah) — lihat
// komentar di sana untuk alasan kenapa disertakan di langkah ini.
export const rkapBudgets = pgTable(
  "rkap_budgets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    // restrict — konvensi FK finansial (Fase 3 Bagian 0), akun yg sudah dianggarkan tidak boleh terhapus.
    accountId: uuid("account_id").notNull().references(() => chartOfAccounts.id, { onDelete: "restrict" }),
    year: integer("year").notNull(),
    budgetedAmount: numeric("budgeted_amount", { precision: 15, scale: 2 }).notNull(),
    description: text("description"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("rkap_budgets_company_account_year_unique").on(table.companyId, table.accountId, table.year),
    check("rkap_budgets_amount_nonneg", sql`${table.budgetedAmount} >= 0`),
    check("rkap_budgets_year_range", sql`${table.year} BETWEEN 2000 AND 2100`),
  ]
);
