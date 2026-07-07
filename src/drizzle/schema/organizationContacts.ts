import { pgTable, uuid, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { organizations } from "./organizations";

// Satu organisasi bisa punya banyak kontak (PIC K3, direktur, dll).
export const organizationContacts = pgTable("organization_contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  position: text("position"),
  email: text("email"),
  phone: text("phone"),
  isPrimary: boolean("is_primary").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
