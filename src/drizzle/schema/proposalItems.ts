import { pgTable, uuid, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { outgoingLetters } from "./outgoingLetters";
import { opportunities } from "./opportunities";

export const proposalItems = pgTable("proposal_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  outgoingLetterId: uuid("outgoing_letter_id").notNull().references(() => outgoingLetters.id, { onDelete: "cascade" }),
  // Nullable krn opportunity opsional (proposal bisa dibuat lepas dari pipeline) — lihat lib/crm/proposalItems.ts.
  opportunityId: uuid("opportunity_id").references(() => opportunities.id, { onDelete: "set null" }),
  itemName: text("item_name").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 2 }).notNull(),
  unit: text("unit").notNull(),
  unitPrice: numeric("unit_price", { precision: 15, scale: 2 }).notNull(),
  // Dihitung di aplikasi (quantity * unit_price), bukan generated column DB — konsisten dgn pola derivasi status/history lain di lib/crm.
  subtotal: numeric("subtotal", { precision: 15, scale: 2 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
