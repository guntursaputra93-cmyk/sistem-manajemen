import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { documentCategories } from "./documentCategories";

// 1 identitas dokumen yang bisa punya banyak versi (lihat documentVersions.ts).
export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id").notNull().references(() => documentCategories.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
