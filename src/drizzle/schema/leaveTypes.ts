import { pgTable, uuid, text, integer, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { companies } from "./companies";

export const leaveTypes = pgTable("leave_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  defaultQuotaPerYear: integer("default_quota_per_year").notNull(),
  isPaid: boolean("is_paid").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("leave_types_company_id_code_unique").on(table.companyId, table.code),
]);
