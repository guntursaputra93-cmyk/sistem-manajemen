import { pgTable, uuid, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const companies = pgTable("companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  // Kode singkat perusahaan (mis. SMU), dipakai di format nomor surat/nota dinas.
  // Diatur manual oleh super_admin lewat halaman pengaturan — nullable karena
  // perusahaan lama (Fase 0) belum punya nilai sampai diisi.
  code: text("code").unique(),
  // Text, bukan Postgres enum — jenis bisnis baru bisa ditambah tanpa migrasi skema.
  businessType: text("business_type").notNull(),
  // URL publik logo di bucket Storage "company-logos" (public, beda dari bucket
  // attachments yang private) — nullable, sidebar fallback ke badge inisial.
  logoUrl: text("logo_url"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
