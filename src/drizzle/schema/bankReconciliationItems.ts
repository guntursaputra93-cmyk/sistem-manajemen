import { pgTable, uuid, boolean, text, timestamp } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { bankReconciliations } from "./bankReconciliations";
import { journalEntryLines } from "./journalEntryLines";

// Baris rekonsiliasi (Fase 3 Langkah 9) — 1 baris = 1 journal_entry_lines yang posted
// ke bank_account_id terkait dalam periode itu, di-generate OTOMATIS saat rekonsiliasi
// dibuka (lib/finance/bankReconciliation.ts openBankReconciliation), bukan diinput
// manual satu-satu. journal_entry_line_id NULLABLE (sesuai spesifikasi) — reserved
// utk item yang suatu saat ditambahkan manual di luar journal_entry_lines (mis. biaya
// bank yang baru ketahuan dari rekening koran, belum dijurnal) — TIDAK diimplementasikan
// di langkah ini, semua item saat ini selalu punya journal_entry_line_id terisi.
export const bankReconciliationItems = pgTable("bank_reconciliation_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  // cascade — baris ini murni detail/checklist milik 1 rekonsiliasi induk, tidak
  // pernah berdiri sendiri (beda dari FK finansial lain yg pakai restrict).
  reconciliationId: uuid("reconciliation_id").notNull().references(() => bankReconciliations.id, { onDelete: "cascade" }),
  // set null (bukan restrict) — kalau jurnal asal suatu saat di-void/terganti, baris
  // rekonsiliasi ini tidak boleh ikut terhalang/hilang, cukup kehilangan link sumbernya.
  journalEntryLineId: uuid("journal_entry_line_id").references(() => journalEntryLines.id, { onDelete: "set null" }),
  isCleared: boolean("is_cleared").notNull().default(false),
  // true = baris ditambahkan MANUAL saat rekonsiliasi (mis. biaya admin bank dari
  // rekening koran) — sistem sekaligus membuat jurnalnya, jadi journal_entry_line_id
  // tetap terisi (menunjuk baris jurnal bank yang baru dibuat). Penanda utk UI/badge.
  isManual: boolean("is_manual").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
