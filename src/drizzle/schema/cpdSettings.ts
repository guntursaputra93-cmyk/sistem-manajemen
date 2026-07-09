import { pgTable, uuid, numeric, timestamp, unique } from "drizzle-orm/pg-core";
import { companies } from "./companies";

// Target jam CPD tahunan — SENGAJA nullable tanpa default (bukan hardcode 20 jam
// atau angka lain): sampai company_admin mengisi lewat halaman pengaturan, halaman
// ringkasan CPD menampilkan "target belum diatur", bukan membandingkan diam-diam
// terhadap asumsi yang tidak diminta. Pola tabel persis dashboard_settings.ts.
export const cpdSettings = pgTable("cpd_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  annualTargetHours: numeric("annual_target_hours", { precision: 5, scale: 2 }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("cpd_settings_company_unique").on(table.companyId),
]);
