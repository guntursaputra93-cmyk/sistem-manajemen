import { pgTable, uuid, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { companies } from "./companies";

// Counter nomor case (Case Management langkah 1.4) — reset tiap tahun, pola PERSIS
// agenda_number_sequences (bukan finance/letter yang perpetual): kuncinya
// company + year, jadi tahun baru = belum ada baris = mulai lagi dari 1. Case hanya
// punya satu jenis nomor, jadi tidak perlu sequence_type seperti finance/letter.
export const caseNumberSequences = pgTable("case_number_sequences", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  year: integer("year").notNull(),
  currentNumber: integer("current_number").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("case_number_sequences_company_year_unique").on(table.companyId, table.year),
]);
