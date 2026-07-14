import { pgTable, pgEnum, uuid, text, date, timestamp, unique, index, type AnyPgColumn } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { users } from "./users";

export const journalEntryStatusEnum = pgEnum("journal_entry_status", ["draft", "posted", "void"]);

// Header jurnal. Baris debit/kredit ada di journal_entry_lines (tabel terpisah,
// 1:N) — lihat schema di sana untuk validasi balance & sisi debit/kredit.
export const journalEntries = pgTable(
  "journal_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    // NULL selagi draft, HANYA diisi saat posting lewat getNextFinanceSequenceNumber
    // (lib/finance/numbering.ts) — draft yang dibatalkan/dihapus tidak pernah
    // menghabiskan nomor urut, jadi tidak ada nomor bolong (Fase 3 Definisi Selesai).
    entryNumber: text("entry_number"),
    entryDate: date("entry_date").notNull(),
    description: text("description").notNull(),
    status: journalEntryStatusEnum("status").notNull().default("draft"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    postedBy: uuid("posted_by").references(() => users.id, { onDelete: "set null" }),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    voidedBy: uuid("voided_by").references(() => users.id, { onDelete: "set null" }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidReason: text("void_reason"),
    // Pola "void + jurnal koreksi baru" (BUKAN edit in place, Fase 3 Bagian 2 Langkah 2)
    // — jurnal koreksi menunjuk balik ke jurnal yang di-void-nya lewat kolom ini.
    // restrict: jurnal asal tidak boleh terhapus selama masih ada koreksi yang menunjuknya
    // (jurnal posted sendiri toh tidak pernah dihapus, hanya di-void — lihat actions.ts).
    correctsEntryId: uuid("corrects_entry_id").references((): AnyPgColumn => journalEntries.id, { onDelete: "restrict" }),
    // Penanda generik asal-usul jurnal (Fase 3 Langkah 8b) — mis. sourceType='payroll',
    // sourceId=payroll_runs.id. TANPA FK sengaja: sourceId polimorfik, bisa menunjuk
    // tabel berbeda tergantung sourceType (payroll_runs, atau modul lain di masa depan),
    // Postgres tidak punya FK kondisional per-tipe tanpa constraint trigger tambahan.
    // Nullable & belum dipakai modul lain (AR/HPP/penyusutan/kasbon tetap null) —
    // ditambahkan sekarang khusus utk integrasi jurnal payroll, bisa diterapkan ulang
    // ke modul lain nanti kalau diperlukan.
    sourceType: text("source_type"),
    sourceId: uuid("source_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("journal_entries_company_entry_number_unique").on(table.companyId, table.entryNumber),
    index("journal_entries_company_status_idx").on(table.companyId, table.status),
    index("journal_entries_source_idx").on(table.sourceType, table.sourceId),
  ]
);
