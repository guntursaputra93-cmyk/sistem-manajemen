import { pgTable, pgEnum, uuid, text, timestamp, unique } from "drizzle-orm/pg-core";
import { companies } from "./companies";

export const salaryComponentTypeEnum = pgEnum("salary_component_type", ["pendapatan", "potongan"]);

export const salaryComponents = pgTable("salary_components", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  componentType: salaryComponentTypeEnum("component_type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("salary_components_company_id_code_unique").on(table.companyId, table.code),
]);
