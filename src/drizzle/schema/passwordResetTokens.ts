import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";

// Lupa password (spesifikasi "Layanan Email Generik + Fitur Lupa Password").
// `token` menyimpan HASH (mis. sha256) dari token mentah yang dikirim lewat
// email — token mentah TIDAK PERNAH disimpan, sama prinsipnya dengan
// passwordHash di users. usedAt nullable = token sekali pakai, begitu dipakai
// langsung ditandai, tidak bisa dipakai ulang meski belum expiresAt.
//
// Tabel ini SENGAJA tidak punya companyId — proses lupa password terjadi
// SEBELUM ada session/company context (persis seperti lookup user saat login
// di auth.ts), jadi query-nya SELALU lewat dbAdmin (bypass RLS by design,
// lihat lib/db/index.ts), tidak pernah lewat db/withTenantContext biasa.
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("password_reset_tokens_user_id_idx").on(table.userId),
]);
