import { pgTable, uuid, text, integer, unique } from "drizzle-orm/pg-core";
import { companies } from "./companies";

// Kode kategori baku didaftarkan admin (bukan bebas ketik) — lihat spesifikasi
// Bagian 2.4. `code` ini JUGA dipakai sebagai jenis_key saat lookup approval_flows
// (applies_to='dokumen') — 1 identifier admin-configured, tidak perlu field
// jenis_key terpisah yang harus dijaga tetap sinkron.
export const documentCategories = pgTable("document_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  // 1 = Peraturan Perusahaan, 2 = SK Direktur, 3 = lainnya (Kontrak, dst).
  // Cuma dipakai pengelompokan/urutan tampilan, BUKAN validasi hukum otomatis.
  hierarchyLevel: integer("hierarchy_level").notNull(),
}, (table) => [
  unique("document_categories_company_code_unique").on(table.companyId, table.code),
]);
