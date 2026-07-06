import { pgTable, uuid, text, timestamp, type AnyPgColumn } from "drizzle-orm/pg-core";
import { companies } from "./companies";

export const departments = pgTable("departments", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // Self-reference untuk struktur bertingkat (mis. departemen di bawah divisi).
  parentDepartmentId: uuid("parent_department_id").references((): AnyPgColumn => departments.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
