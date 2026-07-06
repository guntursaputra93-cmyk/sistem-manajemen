import { pgTable, uuid, text, integer, timestamp, unique } from "drizzle-orm/pg-core";

// Sengaja TIDAK ada company_id: rate limiting dikunci berdasarkan identifier
// (email) sebelum kita tahu email itu milik company mana — bahkan untuk email
// yang tidak terdaftar sama sekali. Mengikuti daftar kolom eksplisit di
// spesifikasi Bagian 2 (bukan aturan umum "semua tabel wajib company_id" yang
// jelas tidak berlaku secara teknis untuk kasus pra-autentikasi ini).
export const rateLimits = pgTable("rate_limits", {
  id: uuid("id").primaryKey().defaultRandom(),
  identifier: text("identifier").notNull(),
  actionType: text("action_type").notNull(),
  attemptCount: integer("attempt_count").notNull().default(0),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull().defaultNow(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
}, (table) => [
  unique("rate_limits_identifier_action_unique").on(table.identifier, table.actionType),
]);
