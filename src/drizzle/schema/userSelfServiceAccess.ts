import { pgTable, uuid, text, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { users } from "./users";

// Restriksi menu self-service per karyawan (Gaji Saya, Kasbon, Reimburse ke depan) —
// TERPISAH dari company_modules (toggle kolektif per perusahaan) dan dari role
// permission matrix (rbac/permissions.ts, generik 4 tingkat). Baris di sini
// mengecilkan akses SATU user tertentu ke fitur self-service tertentu.
//
// Default TERBUKA kalau baris belum ada (beda dari company_modules yang default
// tertutup) — supaya user yang sudah ada hari ini tidak mendadak kehilangan akses
// begitu migrasi ini jalan; restriksi baru berlaku kalau admin eksplisit mematikan
// lewat form edit user.
export const userSelfServiceAccess = pgTable("user_self_service_access", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  featureKey: text("feature_key").notNull(),
  isEnabled: boolean("is_enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("user_self_service_access_user_feature_unique").on(table.userId, table.featureKey),
]);
