import { pgTable, uuid, text, timestamp, unique } from "drizzle-orm/pg-core";
import { companies } from "./companies";

export const competencyTypes = pgTable("competency_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  category: text("category"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("competency_types_company_id_code_unique").on(table.companyId, table.code),
]);
