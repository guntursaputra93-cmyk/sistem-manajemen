import { pgTable, uuid, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { companies } from "./companies";

// Ambang waktu "butuh perhatian" untuk Dashboard Pemantauan — editable admin,
// BUKAN company_modules.terminology_config (itu khusus relabeling istilah per
// perusahaan, mis. "Auditor" vs "Trainer", beda tujuan sama sekali).
export const dashboardSettings = pgTable("dashboard_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  // Dokumen/surat yang "macet" (in_review/menunggu_approval/draft) lebih dari
  // sekian hari dianggap butuh perhatian.
  stalledThresholdDays: integer("stalled_threshold_days").notNull().default(14),
  // Dokumen aktif yang expires_at-nya kurang dari sekian hari lagi dianggap
  // mendekati kedaluwarsa.
  expiryWarningDays: integer("expiry_warning_days").notNull().default(30),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("dashboard_settings_company_unique").on(table.companyId),
]);
