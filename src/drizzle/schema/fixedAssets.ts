import { pgTable, pgEnum, uuid, text, date, numeric, integer, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { companies } from "./companies";
import { chartOfAccounts } from "./chartOfAccounts";
import { users } from "./users";

export const fixedAssetStatusEnum = pgEnum("fixed_asset_status", ["aktif", "dijual", "dihapuskan"]);

// Aset Tetap (Fase 3 Langkah 7). account_id WAJIB akun posting kelompok 121xx
// (PERALATAN & INVENTARIS KANTOR), accumulated_depreciation_account_id WAJIB akun
// posting kelompok 122xx (kontra-aset, normal_balance kredit — lihat Langkah 1) —
// keduanya divalidasi app-level di lib/finance/fixedAssets.ts, ditolak kombinasi lain.
//
// depreciation_expense_account_id TIDAK ada di spesifikasi asli Bagian 2.7 secara
// eksplisit, tapi deskripsi run penyusutan minta "Debit Beban Penyusutan per kelompok
// aset" — COA yang sudah dikonfirmasi Gtr (Langkah 1) TIDAK punya akun "Beban
// Penyusutan" tersendiri, dan menambah akun baru ke struktur yang sudah dikonfirmasi
// bukan keputusan sepihak yang aman diambil di sini. Solusi konsisten dengan pola
// yang sudah dipakai di Langkah 4/5 ("jangan hardcode akun, biarkan admin pilih"):
// admin pilih sendiri akun biaya (posting) yang dipakai sebagai beban penyusutan saat
// membuat aset — kalau belum ada akun "By Penyusutan" khusus, admin bisa tambah dulu
// lewat halaman Kelola Akun (Langkah 1) atau pakai akun biaya lain-lain yang sudah ada.
// "Per kelompok aset" di jurnal gabungan terwujud lewat AGREGASI aset yang berbagi
// akun expense/akumulasi yang sama saat runDepreciation, bukan lewat hardcode akun.
export const fixedAssets = pgTable(
  "fixed_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    // restrict — konvensi FK finansial (Fase 3 Bagian 0).
    accountId: uuid("account_id").notNull().references(() => chartOfAccounts.id, { onDelete: "restrict" }),
    accumulatedDepreciationAccountId: uuid("accumulated_depreciation_account_id").notNull().references(() => chartOfAccounts.id, { onDelete: "restrict" }),
    depreciationExpenseAccountId: uuid("depreciation_expense_account_id").notNull().references(() => chartOfAccounts.id, { onDelete: "restrict" }),
    assetName: text("asset_name").notNull(),
    acquisitionDate: date("acquisition_date").notNull(),
    acquisitionCost: numeric("acquisition_cost", { precision: 15, scale: 2 }).notNull(),
    usefulLifeMonths: integer("useful_life_months").notNull(),
    // Diupdate langsung (BUKAN dihitung ulang tiap kali) oleh lib/finance/fixedAssets.ts
    // runDepreciation setiap ada run baru yang menyentuh aset ini — nilai kumulatif,
    // bukan turunan real-time, supaya riwayat penyusutan tidak berubah kalau
    // usefulLifeMonths diedit di kemudian hari (meski UI saat ini tidak expose edit itu).
    accumulatedDepreciation: numeric("accumulated_depreciation", { precision: 15, scale: 2 }).notNull().default("0"),
    status: fixedAssetStatusEnum("status").notNull().default("aktif"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("fixed_assets_cost_positive", sql`${table.acquisitionCost} > 0`),
    check("fixed_assets_useful_life_positive", sql`${table.usefulLifeMonths} > 0`),
    check("fixed_assets_accumulated_nonneg", sql`${table.accumulatedDepreciation} >= 0`),
    // Same-row check — jangan sampai akumulasi lewat 100% harga perolehan (spesifikasi
    // Langkah 7 "jangan sampai lewat 100%"), defense-in-depth di bawah stop-rule app-level.
    check("fixed_assets_accumulated_lte_cost", sql`${table.accumulatedDepreciation} <= ${table.acquisitionCost}`),
  ]
);
