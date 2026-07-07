import { pgTable, pgEnum, uuid, text, date, timestamp, unique } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { departments } from "./departments";
import { users } from "./users";

export const incomingLetterStatusEnum = pgEnum("incoming_letter_status", [
  "baru",
  "didisposisikan",
  "selesai",
  "diarsipkan",
]);

export const incomingLetters = pgTable("incoming_letters", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  // Format AG-{tahun}-{urut, reset tiap tahun} — lihat agendaNumberSequences.ts.
  agendaNumber: text("agenda_number").notNull(),
  letterDate: date("letter_date").notNull(),
  receivedDate: date("received_date").notNull(),
  sender: text("sender").notNull(),
  subject: text("subject").notNull(),
  // Tujuan awal, nullable — bisa didisposisikan lagi setelahnya.
  departmentId: uuid("department_id").references(() => departments.id, { onDelete: "set null" }),
  status: incomingLetterStatusEnum("status").notNull().default("baru"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("incoming_letters_company_agenda_unique").on(table.companyId, table.agendaNumber),
]);
