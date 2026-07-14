import { pgTable, uuid, integer, timestamp, unique, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { companies } from "./companies";
import { journalEntries } from "./journalEntries";
import { users } from "./users";

// Jejak eksekusi penyusutan (Fase 3 Langkah 7) — 1 baris = 1 kali tombol "Jalankan
// Penyusutan" ditekan utk 1 period_month+period_year, mencakup SEMUA aset status='aktif'
// sekaligus dalam 1 journal_entry gabungan (journal_entry_id). Unique constraint di
// bawah adalah pertahanan idempotency lapis DB (defense-in-depth) — pengecekan utama
// tetap app-level di lib/finance/fixedAssets.ts runDepreciation (cek dulu SEBELUM
// insert, supaya pesan errornya jelas, bukan mengandalkan constraint-violation mentah).
export const depreciationRuns = pgTable(
  "depreciation_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    periodMonth: integer("period_month").notNull(),
    periodYear: integer("period_year").notNull(),
    // restrict — jurnal penyusutan yg sudah tercatat tidak boleh terhapus selama run-nya masih ada.
    journalEntryId: uuid("journal_entry_id").notNull().references(() => journalEntries.id, { onDelete: "restrict" }),
    runBy: uuid("run_by").references(() => users.id, { onDelete: "set null" }),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("depreciation_runs_company_period_unique").on(table.companyId, table.periodMonth, table.periodYear),
    check("depreciation_runs_month_range", sql`${table.periodMonth} BETWEEN 1 AND 12`),
    check("depreciation_runs_year_range", sql`${table.periodYear} BETWEEN 2000 AND 2100`),
  ]
);
