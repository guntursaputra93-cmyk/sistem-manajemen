import { pgTable, uuid, text, boolean, jsonb, timestamp, unique } from "drizzle-orm/pg-core";
import { companies } from "./companies";

export const companyModules = pgTable("company_modules", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  moduleKey: text("module_key").notNull(),
  isEnabled: boolean("is_enabled").notNull().default(false),
  terminologyConfig: jsonb("terminology_config").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // Satu company tidak boleh punya baris ganda untuk module_key yang sama.
  unique("company_modules_company_module_unique").on(table.companyId, table.moduleKey),
]);
