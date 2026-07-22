import { pgTable, uuid, text, boolean, timestamp, unique, index } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { users } from "./users";

// Template jurnal (Item C — jurnal cepat). Sebuah "resep" jurnal yang sering
// dipakai staf keuangan: nama + kumpulan baris (akun + sisi debit/kredit) yang
// TIDAK menyimpan nominal — nominal diisi staf saat memakai template (halaman
// jurnal cepat), lalu sistem membuat header + baris + langsung memposting dalam
// satu aksi atomik (lihat lib/finance/journalTemplates.ts). Tujuannya mengurangi
// waktu berpikir & risiko salah pilih akun/sisi saat input jurnal berulang.
export const journalTemplates = pgTable(
  "journal_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    // Nonaktifkan tanpa menghapus — template lama tetap tertaut ke jurnal yang
    // sudah dibuat darinya (journal_entries.source_id), jadi tidak dihapus keras.
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("journal_templates_company_name_unique").on(table.companyId, table.name),
    index("journal_templates_company_active_idx").on(table.companyId, table.isActive),
  ]
);
