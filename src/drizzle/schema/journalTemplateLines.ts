import { pgTable, pgEnum, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { journalTemplates } from "./journalTemplates";
import { chartOfAccounts } from "./chartOfAccounts";

// Sisi baris template — hanya menentukan debit vs kredit; nominalnya baru diisi
// saat template dipakai. Enum terpisah (bukan reuse normal_balance) supaya makna
// jelas: ini "sisi yang akan dipakai baris jurnal", bukan saldo normal akun.
export const journalTemplateSideEnum = pgEnum("journal_template_side", ["debit", "kredit"]);

// Baris template jurnal. company_id diduplikasi (bisa di-join lewat template_id)
// mengikuti pola journal_entry_lines: tiap tabel punya company_id sendiri supaya
// RLS tenant-isolation tidak bergantung pada JOIN.
export const journalTemplateLines = pgTable(
  "journal_template_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    templateId: uuid("template_id").notNull().references(() => journalTemplates.id, { onDelete: "cascade" }),
    // restrict — akun yang sudah dipakai template tidak boleh terhapus (pola FK
    // finansial sama dengan journal_entry_lines.account_id). Akun harus posting
    // (is_header=false) — divalidasi app-level saat menambah baris template.
    accountId: uuid("account_id").notNull().references(() => chartOfAccounts.id, { onDelete: "restrict" }),
    side: journalTemplateSideEnum("side").notNull(),
    lineOrder: integer("line_order").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("journal_template_lines_template_idx").on(table.templateId)]
);
