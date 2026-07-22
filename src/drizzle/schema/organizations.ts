import { pgTable, pgEnum, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { companies } from "./companies";

// Peran rekanan terhadap perusahaan kita. Awalnya tabel ini murni CRM (klien saja),
// tapi modul Keuangan butuh lawan transaksi non-klien juga: vendor/pemasok untuk
// uang muka & hutang. Satu master dipakai bersama (bukan tabel terpisah) supaya
// pihak yang berperan ganda cukup satu baris — pilih 'keduanya'.
export const organizationPartnerTypeEnum = pgEnum("organization_partner_type", ["klien", "pemasok", "keduanya"]);

// Tabel BARU (bukan perluasan — spek modul CRM mengasumsikan ini sudah ada
// dari Fase 1, tapi tidak pernah dibuat; struktur dasar di bawah didesain
// sekarang, dikonfirmasi ke Gtr sebelum eksekusi). Klien/organisasi yang
// jadi target penjualan CRM.
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // Default 'klien' — semua baris lama memang klien CRM, jadi migrasi tidak mengubah
  // makna data yang sudah ada.
  partnerType: organizationPartnerTypeEnum("partner_type").notNull().default("klien"),
  industry: text("industry"),
  // Teks bebas (mis. "50-100 karyawan"), bukan angka kaku — konsisten dgn
  // `source` yang juga teks bebas dikonfigurasi sendiri oleh admin/sales.
  companySize: text("company_size"),
  source: text("source"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
