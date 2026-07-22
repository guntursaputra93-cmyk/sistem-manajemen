import { pgTable, uuid, numeric, timestamp, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { companies } from "./companies";
import { openItems } from "./openItems";
import { journalEntries } from "./journalEntries";
import { users } from "./users";

// Penautan tiap jurnal PENYELESAIAN ke transaksi terbuka. Satu open_item bisa
// punya banyak baris di sini (pelunasan/pertanggungjawaban bertahap). company_id
// diduplikasi mengikuti pola journal_entry_lines supaya RLS tidak bergantung JOIN.
export const openItemSettlements = pgTable(
  "open_item_settlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    // cascade — kalau open_item terhapus, penautan ikut hilang (jurnal penyelesaian
    // sendiri tetap ada; open_item hanya lapisan pelacakan di atas jurnal).
    openItemId: uuid("open_item_id").notNull().references(() => openItems.id, { onDelete: "cascade" }),
    // Jurnal penyelesaian (sudah posted). restrict — jangan hilang selama tautan ada.
    journalEntryId: uuid("journal_entry_id").notNull().references(() => journalEntries.id, { onDelete: "restrict" }),
    amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("open_item_settlements_item_idx").on(table.openItemId),
    check("open_item_settlements_amount_positive", sql`${table.amount} > 0`),
  ]
);
