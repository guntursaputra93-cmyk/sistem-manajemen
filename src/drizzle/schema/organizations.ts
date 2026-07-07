import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { companies } from "./companies";

// Tabel BARU (bukan perluasan — spek modul CRM mengasumsikan ini sudah ada
// dari Fase 1, tapi tidak pernah dibuat; struktur dasar di bawah didesain
// sekarang, dikonfirmasi ke Gtr sebelum eksekusi). Klien/organisasi yang
// jadi target penjualan CRM.
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  industry: text("industry"),
  // Teks bebas (mis. "50-100 karyawan"), bukan angka kaku — konsisten dgn
  // `source` yang juga teks bebas dikonfigurasi sendiri oleh admin/sales.
  companySize: text("company_size"),
  source: text("source"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
