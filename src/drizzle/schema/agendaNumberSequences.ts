import { pgTable, uuid, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { companies } from "./companies";

// Counter nomor agenda surat masuk — reset tiap tahun (beda dari
// letter_number_sequences yang sengaja TIDAK PERNAH reset), jadi kuncinya
// company + year, bukan company + department + jenis.
export const agendaNumberSequences = pgTable("agenda_number_sequences", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  year: integer("year").notNull(),
  currentNumber: integer("current_number").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("agenda_number_sequences_company_year_unique").on(table.companyId, table.year),
]);
