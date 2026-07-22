import { pgTable, pgEnum, uuid, text, integer, boolean, timestamp, unique, check, index, type AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { companies } from "./companies";

// Digit pertama kode (1=aset..6=biaya) menentukan default account_type/normal_balance
// (Fase 3 spesifikasi Bagian 1) — dengan pengecualian akun kontra-aset (11400/1220x)
// yang dibalik jadi kredit meski account_type tetap 'aset'. Karena ada pengecualian
// itu, normal_balance TIDAK diturunkan dari account_type di kode — disimpan eksplisit
// per baris saat seed, bukan dihitung ulang tiap query.
export const accountTypeEnum = pgEnum("account_type", ["aset", "kewajiban", "modal", "pendapatan", "hpp", "biaya"]);
export const normalBalanceEnum = pgEnum("normal_balance", ["debit", "kredit"]);

// Struktur 3 level (direvisi dari draf awal 1-4 level — keputusan Gtr, lihat Fase 3
// spesifikasi Bagian 1). Level 1-2 SELALU header (grup penjumlah). Level 3 BISA
// header ATAU posting, dibedakan oleh is_header, bukan oleh level — grup kode
// XXX00 yang punya >=2 anak tetap jadi header level 3 dengan anak XXXXX juga level 3
// (bukan level 4); level column dengan sengaja adalah "kedalaman di-cap ke 3", bukan
// kedalaman pohon literal, supaya validasi "hanya is_header=false boleh dijurnal"
// (Langkah 2) tidak perlu tahu kedalaman asli.
export const chartOfAccounts = pgTable(
  "chart_of_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    level: integer("level").notNull(),
    // Self-reference, bukan parent_code — code tetap identifier tampilan/seed, tapi
    // pohon dinavigasi lewat id supaya rename code (kalau suatu saat diizinkan) tidak
    // pernah bisa merusak relasi. restrict: parent tidak boleh dihapus selama masih
    // punya anak (integritas pohon) — lihat guard di actions.ts (Langkah 1) dan guard
    // journal_entry_lines yang akan ditambahkan di Langkah 2.
    parentId: uuid("parent_id").references((): AnyPgColumn => chartOfAccounts.id, { onDelete: "restrict" }),
    accountType: accountTypeEnum("account_type").notNull(),
    normalBalance: normalBalanceEnum("normal_balance").notNull(),
    // true = baris header/grup penjumlah, TIDAK boleh dipakai posting jurnal langsung
    // (validasi app-level di Langkah 2). false = akun posting/transaksi.
    isHeader: boolean("is_header").notNull().default(false),
    // Nonaktifkan tanpa menghapus (akun lama tetap perlu tampil di laporan historis).
    isActive: boolean("is_active").notNull().default(true),
    // Setting "akun transaksi terbuka" (Item Setting Keuangan). Kalau true, tiap kali
    // akun ini DIDEBET di jurnal, sistem otomatis membuka transaksi terbuka (uang muka
    // dsb) — menghilangkan risiko user lupa menandai. open_item_type = jenis default
    // item yang dibuka ('uang_muka' | 'lainnya'); disimpan text (bukan enum) untuk
    // menghindari saling-impor antar file schema — nilainya divalidasi app-level.
    isOpenItem: boolean("is_open_item").notNull().default(false),
    openItemType: text("open_item_type"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("chart_of_accounts_company_code_unique").on(table.companyId, table.code),
    index("chart_of_accounts_company_parent_idx").on(table.companyId, table.parentId),
    check("chart_of_accounts_level_range", sql`${table.level} BETWEEN 1 AND 3`),
    // Level 1-2 wajib header; level 3 bebas (header atau posting) — lihat komentar di atas.
    check("chart_of_accounts_level1_2_is_header", sql`${table.level} = 3 OR ${table.isHeader} = true`),
    check("chart_of_accounts_root_has_no_parent", sql`${table.level} > 1 OR ${table.parentId} IS NULL`),
    check("chart_of_accounts_non_root_has_parent", sql`${table.level} = 1 OR ${table.parentId} IS NOT NULL`),
  ]
);
