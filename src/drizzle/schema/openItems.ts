import { pgTable, pgEnum, uuid, text, date, numeric, timestamp, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { companies } from "./companies";
import { chartOfAccounts } from "./chartOfAccounts";
import { journalEntries } from "./journalEntries";
import { organizations } from "./organizations";
import { users } from "./users";

// Jenis transaksi terbuka. 'uang_muka' = aset (mis. 11501 Uang Muka Dinas) yang
// dibuka saat kas keluar dan ditutup saat pertanggungjawaban; 'dp_diterima' =
// kewajiban (21301 Pendapatan Diterima Dimuka) yang dibuka saat DP masuk dan
// ditutup saat pekerjaan/tagihan selesai; 'lainnya' = pola serupa lain.
export const openItemTypeEnum = pgEnum("open_item_type", ["uang_muka", "dp_diterima", "lainnya"]);

// terbuka = belum ada penyelesaian; sebagian = sudah ditutup sebagian (pelunasan
// bertahap); selesai = akun kontrol sudah lunas (settled = opening).
export const openItemStatusEnum = pgEnum("open_item_status", ["terbuka", "sebagian", "selesai"]);

// Transaksi Terbuka (open item). Jurnal PEMBUKA yang sudah diposting dan menyentuh
// akun kontrol (uang muka / DP) yang saldonya belum dibersihkan — item tetap
// "terbuka" sampai ditutup jurnal penyelesaian (lihat lib/finance/openItems.ts).
// BUKAN draft akuntansi: jurnal pembuka sudah posted & bernomor; yang terbuka
// adalah TRANSAKSINYA (butuh tindak lanjut), bukan status jurnalnya.
export const openItems = pgTable(
  "open_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    type: openItemTypeEnum("type").notNull(),
    // Akun kontrol yang saldonya ditunggu bersih (mis. 11501/11502/21301). restrict —
    // akun yang jadi kontrol item terbuka tidak boleh terhapus (pola FK finansial).
    controlAccountId: uuid("control_account_id").notNull().references(() => chartOfAccounts.id, { onDelete: "restrict" }),
    // Pihak / keterangan bebas ("Budi — dinas Surabaya", "PT X — proyek audit").
    // Tetap wajib: menampung pihak yang belum punya master (karyawan/vendor).
    description: text("description").notNull(),
    // Tautan PRESISI ke rekanan/klien CRM (Item 5a) — dipakai untuk menelusuri
    // uang muka & DP per rekanan. Opsional karena organizations saat ini hanya
    // berisi klien; pihak lain (karyawan/vendor) cukup lewat `description`.
    // restrict — konvensi FK finansial: rekanan yang masih punya transaksi
    // terbuka tidak boleh dihapus.
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "restrict" }),
    // Jurnal pembuka (sudah posted). restrict — tidak boleh dihapus selama item ada.
    openingEntryId: uuid("opening_entry_id").notNull().references(() => journalEntries.id, { onDelete: "restrict" }),
    openingAmount: numeric("opening_amount", { precision: 15, scale: 2 }).notNull(),
    // Akumulasi nilai yang sudah ditutup lewat jurnal penyelesaian (0..opening).
    settledAmount: numeric("settled_amount", { precision: 15, scale: 2 }).notNull().default("0"),
    status: openItemStatusEnum("status").notNull().default("terbuka"),
    dueDate: date("due_date"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("open_items_company_status_idx").on(table.companyId, table.status),
    // Penelusuran per rekanan (Item 5a): "semua uang muka/DP milik rekanan X".
    index("open_items_company_organization_idx").on(table.companyId, table.organizationId),
    check("open_items_opening_positive", sql`${table.openingAmount} > 0`),
    check("open_items_settled_nonneg", sql`${table.settledAmount} >= 0`),
    check("open_items_settled_lte_opening", sql`${table.settledAmount} <= ${table.openingAmount}`),
  ]
);
