import { pgTable, uuid, integer, numeric, unique, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { companies } from "./companies";
import { rkapBudgets } from "./rkapBudgets";

// Breakdown bulanan OPSIONAL per rkap_budgets (Fase 3 Langkah 6). Spesifikasi
// Bagian 2.6 menyerahkan keputusan sertakan-atau-tidak ke saat eksekusi — disertakan
// di sini karena effort tambahannya kecil (1 tabel + 1 form) dan RKAP di praktiknya
// hampir selalu dipantau bulanan utk realisasi berjalan, bukan cuma dicek di akhir
// tahun (alasan eksplisit dari Gtr). company_id diduplikasi di sini juga (bisa
// di-join lewat budget_id) — pola sama seperti journal_entry_lines: tiap tabel
// punya company_id sendiri supaya RLS tenant-isolation tidak pernah bergantung pada JOIN.
//
// cascade (bukan restrict) — baris bulanan sepenuhnya bagian dari 1 rkap_budgets
// induk, terhapus otomatis kalau induknya dihapus (beda dari FK finansial lain yg
// pakai restrict, karena baris ini bukan record transaksi independen, cuma
// breakdown/pecahan dari induknya). Sum(budgeted_amount) 12 baris ini WAJIB sama
// dengan rkap_budgets.budgeted_amount induknya — divalidasi app-level saat disimpan
// (lib/finance/rkap.ts setMonthlyBreakdown), bukan CHECK constraint (butuh agregat
// lintas-baris, di luar kemampuan CHECK per-baris Postgres).
export const rkapBudgetMonthly = pgTable(
  "rkap_budget_monthly",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    budgetId: uuid("budget_id").notNull().references(() => rkapBudgets.id, { onDelete: "cascade" }),
    month: integer("month").notNull(),
    budgetedAmount: numeric("budgeted_amount", { precision: 15, scale: 2 }).notNull(),
  },
  (table) => [
    unique("rkap_budget_monthly_budget_month_unique").on(table.budgetId, table.month),
    check("rkap_budget_monthly_month_range", sql`${table.month} BETWEEN 1 AND 12`),
    check("rkap_budget_monthly_amount_nonneg", sql`${table.budgetedAmount} >= 0`),
  ]
);
