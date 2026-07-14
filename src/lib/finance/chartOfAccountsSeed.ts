import type { accountTypeEnum, normalBalanceEnum } from "@/drizzle/schema";

type AccountType = (typeof accountTypeEnum.enumValues)[number];
type NormalBalance = (typeof normalBalanceEnum.enumValues)[number];

export type ChartOfAccountSeedRow = {
  code: string;
  name: string;
  level: 1 | 2 | 3;
  parentCode: string | null;
  accountType: AccountType;
  normalBalance: NormalBalance;
  isHeader: boolean;
};

// Template universal, sama persis untuk SEMUA company (Fase 3 spesifikasi Bagian 1,
// dikonfirmasi Gtr) — TIDAK dibedakan per jenis bisnis. Admin non-Sapta rename/
// nonaktifkan manual lewat halaman admin COA (Langkah 1) kalau ada akun yang tidak
// relevan buat mereka, bukan dikurasi di sini.
//
// Kode header yang dibuang oleh aturan "cuma 1 anak" (11100, 12300, 21200, 21300,
// 21400, 21500, 32100, 42200) SENGAJA TIDAK ADA di daftar ini — anaknya langsung
// dipakai sebagai baris level 3 posting di bawah level 2, persis sesuai spesifikasi.
//
// accountType/normalBalance default dari digit pertama kode (1=aset/debit,
// 2=kewajiban/kredit, 3=modal/kredit, 4=pendapatan/kredit, 5=hpp/debit, 6=biaya/debit)
// KECUALI 4 akun kontra-aset (11400, 12201, 12202, 12203) yang normal_balance-nya
// dibalik jadi kredit meski account_type tetap 'aset' — ditulis eksplisit per baris
// di bawah, bukan diturunkan otomatis dari accountType, supaya pengecualian ini
// terlihat jelas saat direview.
export const CHART_OF_ACCOUNTS_SEED: ChartOfAccountSeedRow[] = [
  // ===== 10000 ASET =====
  { code: "10000", name: "ASET", level: 1, parentCode: null, accountType: "aset", normalBalance: "debit", isHeader: true },
  { code: "11000", name: "ASET LANCAR", level: 2, parentCode: "10000", accountType: "aset", normalBalance: "debit", isHeader: true },
  { code: "11101", name: "Petty Cash", level: 3, parentCode: "11000", accountType: "aset", normalBalance: "debit", isHeader: false },
  { code: "11200", name: "BANK", level: 3, parentCode: "11000", accountType: "aset", normalBalance: "debit", isHeader: true },
  { code: "11201", name: "Bank Mandiri", level: 3, parentCode: "11200", accountType: "aset", normalBalance: "debit", isHeader: false },
  { code: "11202", name: "Bank BCA", level: 3, parentCode: "11200", accountType: "aset", normalBalance: "debit", isHeader: false },
  { code: "11203", name: "Bank BNI", level: 3, parentCode: "11200", accountType: "aset", normalBalance: "debit", isHeader: false },
  { code: "11300", name: "PIUTANG", level: 3, parentCode: "11000", accountType: "aset", normalBalance: "debit", isHeader: true },
  { code: "11301", name: "Piutang Usaha", level: 3, parentCode: "11300", accountType: "aset", normalBalance: "debit", isHeader: false },
  { code: "11302", name: "Piutang Non Usaha", level: 3, parentCode: "11300", accountType: "aset", normalBalance: "debit", isHeader: false },
  { code: "11303", name: "Piutang Karyawan", level: 3, parentCode: "11300", accountType: "aset", normalBalance: "debit", isHeader: false },
  { code: "11400", name: "Piutang Tak Tertagih", level: 3, parentCode: "11000", accountType: "aset", normalBalance: "kredit", isHeader: false },
  { code: "11500", name: "UANG MUKA", level: 3, parentCode: "11000", accountType: "aset", normalBalance: "debit", isHeader: true },
  { code: "11501", name: "Uang Muka Dinas", level: 3, parentCode: "11500", accountType: "aset", normalBalance: "debit", isHeader: false },
  { code: "11502", name: "Uang Muka Operasional", level: 3, parentCode: "11500", accountType: "aset", normalBalance: "debit", isHeader: false },
  { code: "11600", name: "DIBAYAR DIMUKA", level: 3, parentCode: "11000", accountType: "aset", normalBalance: "debit", isHeader: true },
  { code: "11601", name: "Sewa Dibayar Dimuka", level: 3, parentCode: "11600", accountType: "aset", normalBalance: "debit", isHeader: false },
  { code: "11602", name: "Lain-Lain Dibayar Dimuka", level: 3, parentCode: "11600", accountType: "aset", normalBalance: "debit", isHeader: false },
  { code: "11700", name: "PAJAK DIBAYAR DIMUKA", level: 3, parentCode: "11000", accountType: "aset", normalBalance: "debit", isHeader: true },
  { code: "11701", name: "PPN Masukan", level: 3, parentCode: "11700", accountType: "aset", normalBalance: "debit", isHeader: false },
  { code: "11702", name: "PPH 23", level: 3, parentCode: "11700", accountType: "aset", normalBalance: "debit", isHeader: false },
  { code: "11800", name: "Aktiva Lain-Lain", level: 3, parentCode: "11000", accountType: "aset", normalBalance: "debit", isHeader: false },
  { code: "12000", name: "AKTIVA TETAP", level: 2, parentCode: "10000", accountType: "aset", normalBalance: "debit", isHeader: true },
  { code: "12100", name: "PERALATAN & INVENTARIS KANTOR", level: 3, parentCode: "12000", accountType: "aset", normalBalance: "debit", isHeader: true },
  { code: "12101", name: "Perangkat Elektronik", level: 3, parentCode: "12100", accountType: "aset", normalBalance: "debit", isHeader: false },
  { code: "12102", name: "Perabot Dan & Inventaris Kantor", level: 3, parentCode: "12100", accountType: "aset", normalBalance: "debit", isHeader: false },
  { code: "12103", name: "Kendaraan", level: 3, parentCode: "12100", accountType: "aset", normalBalance: "debit", isHeader: false },
  { code: "12200", name: "PENYUSUTAN", level: 3, parentCode: "12000", accountType: "aset", normalBalance: "debit", isHeader: true },
  { code: "12201", name: "Akumulasi Penyusutan Perangkat Elektronik", level: 3, parentCode: "12200", accountType: "aset", normalBalance: "kredit", isHeader: false },
  { code: "12202", name: "Akumulasi Penyusutan Perabot & Inventaris Kantor", level: 3, parentCode: "12200", accountType: "aset", normalBalance: "kredit", isHeader: false },
  { code: "12203", name: "Akumulasi Penyusutan Kendaraan", level: 3, parentCode: "12200", accountType: "aset", normalBalance: "kredit", isHeader: false },
  { code: "12301", name: "Amortisasi", level: 3, parentCode: "12000", accountType: "aset", normalBalance: "debit", isHeader: false },

  // ===== 20000 HUTANG =====
  { code: "20000", name: "HUTANG", level: 1, parentCode: null, accountType: "kewajiban", normalBalance: "kredit", isHeader: true },
  { code: "21000", name: "HUTANG LANCAR", level: 2, parentCode: "20000", accountType: "kewajiban", normalBalance: "kredit", isHeader: true },
  { code: "21100", name: "HUTANG USAHA", level: 3, parentCode: "21000", accountType: "kewajiban", normalBalance: "kredit", isHeader: true },
  { code: "21101", name: "Utang Usaha", level: 3, parentCode: "21100", accountType: "kewajiban", normalBalance: "kredit", isHeader: false },
  { code: "21102", name: "Utang Gaji", level: 3, parentCode: "21100", accountType: "kewajiban", normalBalance: "kredit", isHeader: false },
  { code: "21103", name: "Utang Honor", level: 3, parentCode: "21100", accountType: "kewajiban", normalBalance: "kredit", isHeader: false },
  { code: "21201", name: "Utang PPH 21", level: 3, parentCode: "21000", accountType: "kewajiban", normalBalance: "kredit", isHeader: false },
  { code: "21301", name: "Pendapatan Diterima Dimuka", level: 3, parentCode: "21000", accountType: "kewajiban", normalBalance: "kredit", isHeader: false },
  { code: "21401", name: "Biaya Akrual", level: 3, parentCode: "21000", accountType: "kewajiban", normalBalance: "kredit", isHeader: false },
  { code: "21501", name: "Hutang Lancar Lain-Lain", level: 3, parentCode: "21000", accountType: "kewajiban", normalBalance: "kredit", isHeader: false },
  { code: "22000", name: "HUTANG JANGKA PANJANG", level: 2, parentCode: "20000", accountType: "kewajiban", normalBalance: "kredit", isHeader: true },
  { code: "22100", name: "Hutang Bank", level: 3, parentCode: "22000", accountType: "kewajiban", normalBalance: "kredit", isHeader: false },
  { code: "22200", name: "Hutang Imbalan Kerja", level: 3, parentCode: "22000", accountType: "kewajiban", normalBalance: "kredit", isHeader: false },

  // ===== 30000 MODAL =====
  { code: "30000", name: "MODAL", level: 1, parentCode: null, accountType: "modal", normalBalance: "kredit", isHeader: true },
  { code: "31000", name: "MODAL DISETOR", level: 2, parentCode: "30000", accountType: "modal", normalBalance: "kredit", isHeader: true },
  { code: "31100", name: "MODAL DISETOR", level: 3, parentCode: "31000", accountType: "modal", normalBalance: "kredit", isHeader: true },
  { code: "31101", name: "Modal Pemilik 1", level: 3, parentCode: "31100", accountType: "modal", normalBalance: "kredit", isHeader: false },
  { code: "31102", name: "Modal Pemilik 2", level: 3, parentCode: "31100", accountType: "modal", normalBalance: "kredit", isHeader: false },
  { code: "31103", name: "Hutang Modal Pemilik 1", level: 3, parentCode: "31100", accountType: "modal", normalBalance: "kredit", isHeader: false },
  { code: "31104", name: "Hutang Modal Pemilik 2", level: 3, parentCode: "31100", accountType: "modal", normalBalance: "kredit", isHeader: false },
  { code: "32000", name: "LABA RUGI", level: 2, parentCode: "30000", accountType: "modal", normalBalance: "kredit", isHeader: true },
  { code: "32101", name: "Laba Rugi Di Tahan", level: 3, parentCode: "32000", accountType: "modal", normalBalance: "kredit", isHeader: false },

  // ===== 40000 PENDAPATAN =====
  { code: "40000", name: "PENDAPATAN", level: 1, parentCode: null, accountType: "pendapatan", normalBalance: "kredit", isHeader: true },
  { code: "41000", name: "PENDAPATAN JASA", level: 2, parentCode: "40000", accountType: "pendapatan", normalBalance: "kredit", isHeader: true },
  { code: "41100", name: "PENJUALAN SERTIFIKASI", level: 3, parentCode: "41000", accountType: "pendapatan", normalBalance: "kredit", isHeader: true },
  { code: "41101", name: "Penjualan SMK3", level: 3, parentCode: "41100", accountType: "pendapatan", normalBalance: "kredit", isHeader: false },
  { code: "41102", name: "Penjualan Pra Audit", level: 3, parentCode: "41100", accountType: "pendapatan", normalBalance: "kredit", isHeader: false },
  { code: "41103", name: "Penjualan Sertifikasi", level: 3, parentCode: "41100", accountType: "pendapatan", normalBalance: "kredit", isHeader: false },
  { code: "42000", name: "PENDAPATAN LAIN-LAIN", level: 2, parentCode: "40000", accountType: "pendapatan", normalBalance: "kredit", isHeader: true },
  { code: "42100", name: "PENDAPATAN BANK", level: 3, parentCode: "42000", accountType: "pendapatan", normalBalance: "kredit", isHeader: true },
  { code: "42101", name: "Bunga Bank Mandiri", level: 3, parentCode: "42100", accountType: "pendapatan", normalBalance: "kredit", isHeader: false },
  { code: "42102", name: "Bunga Bank BCA", level: 3, parentCode: "42100", accountType: "pendapatan", normalBalance: "kredit", isHeader: false },
  { code: "42103", name: "Bunga Bank BNI", level: 3, parentCode: "42100", accountType: "pendapatan", normalBalance: "kredit", isHeader: false },
  { code: "42201", name: "Pendapatan Lain-Lain", level: 3, parentCode: "42000", accountType: "pendapatan", normalBalance: "kredit", isHeader: false },
  { code: "43000", name: "KOMISI", level: 2, parentCode: "40000", accountType: "pendapatan", normalBalance: "kredit", isHeader: true },
  { code: "43100", name: "KOMISI PENJUALAN", level: 3, parentCode: "43000", accountType: "pendapatan", normalBalance: "kredit", isHeader: true },
  { code: "43101", name: "Komisi Penjualan Audit", level: 3, parentCode: "43100", accountType: "pendapatan", normalBalance: "kredit", isHeader: false },
  { code: "43102", name: "Komisi Penjualan Pra Audit", level: 3, parentCode: "43100", accountType: "pendapatan", normalBalance: "kredit", isHeader: false },
  { code: "43103", name: "Komisi Penjualan Sertifikasi", level: 3, parentCode: "43100", accountType: "pendapatan", normalBalance: "kredit", isHeader: false },

  // ===== 50000 HPP =====
  { code: "50000", name: "HPP", level: 1, parentCode: null, accountType: "hpp", normalBalance: "debit", isHeader: true },
  { code: "51000", name: "HPP AUDIT", level: 2, parentCode: "50000", accountType: "hpp", normalBalance: "debit", isHeader: true },
  { code: "51100", name: "BIAYA LANGSUNG OPERASIONAL AUDIT", level: 3, parentCode: "51000", accountType: "hpp", normalBalance: "debit", isHeader: true },
  { code: "51101", name: "By Honor Auditor", level: 3, parentCode: "51100", accountType: "hpp", normalBalance: "debit", isHeader: false },
  { code: "51102", name: "By Insentif Admin", level: 3, parentCode: "51100", accountType: "hpp", normalBalance: "debit", isHeader: false },
  { code: "51103", name: "By Perjalanan Dinas", level: 3, parentCode: "51100", accountType: "hpp", normalBalance: "debit", isHeader: false },
  { code: "51104", name: "By Subkontraktor", level: 3, parentCode: "51100", accountType: "hpp", normalBalance: "debit", isHeader: false },
  { code: "51105", name: "By Alat & Perlengkapan", level: 3, parentCode: "51100", accountType: "hpp", normalBalance: "debit", isHeader: false },
  { code: "51106", name: "By Dokumentasi & Pelaporan", level: 3, parentCode: "51100", accountType: "hpp", normalBalance: "debit", isHeader: false },
  { code: "51107", name: "By Sertifikasi", level: 3, parentCode: "51100", accountType: "hpp", normalBalance: "debit", isHeader: false },
  { code: "51108", name: "By PNBP", level: 3, parentCode: "51100", accountType: "hpp", normalBalance: "debit", isHeader: false },
  { code: "51109", name: "By Bank", level: 3, parentCode: "51100", accountType: "hpp", normalBalance: "debit", isHeader: false },

  // ===== 60000 BIAYA =====
  { code: "60000", name: "BIAYA", level: 1, parentCode: null, accountType: "biaya", normalBalance: "debit", isHeader: true },
  { code: "61000", name: "BIAYA OPERASIONAL", level: 2, parentCode: "60000", accountType: "biaya", normalBalance: "debit", isHeader: true },
  { code: "61100", name: "BIAYA SUMBER DAYA MANUSIA", level: 3, parentCode: "61000", accountType: "biaya", normalBalance: "debit", isHeader: true },
  { code: "61101", name: "By Gaji", level: 3, parentCode: "61100", accountType: "biaya", normalBalance: "debit", isHeader: false },
  { code: "61102", name: "By BPJS", level: 3, parentCode: "61100", accountType: "biaya", normalBalance: "debit", isHeader: false },
  { code: "61103", name: "By Pelatihan & Sertifikasi", level: 3, parentCode: "61100", accountType: "biaya", normalBalance: "debit", isHeader: false },
  { code: "61104", name: "By Tunjangan Lainnya", level: 3, parentCode: "61100", accountType: "biaya", normalBalance: "debit", isHeader: false },
  { code: "61105", name: "By PPH 21", level: 3, parentCode: "61100", accountType: "biaya", normalBalance: "debit", isHeader: false },
  { code: "61200", name: "BIAYA OPERASIONAL KANTOR", level: 3, parentCode: "61000", accountType: "biaya", normalBalance: "debit", isHeader: true },
  { code: "61201", name: "By Sewa Gedung", level: 3, parentCode: "61200", accountType: "biaya", normalBalance: "debit", isHeader: false },
  { code: "61202", name: "By Sewa Kendaraan", level: 3, parentCode: "61200", accountType: "biaya", normalBalance: "debit", isHeader: false },
  { code: "61203", name: "By Percetakan dan Pengiriman", level: 3, parentCode: "61200", accountType: "biaya", normalBalance: "debit", isHeader: false },
  { code: "61204", name: "By ATK", level: 3, parentCode: "61200", accountType: "biaya", normalBalance: "debit", isHeader: false },
  { code: "61205", name: "By RTK", level: 3, parentCode: "61200", accountType: "biaya", normalBalance: "debit", isHeader: false },
  { code: "61206", name: "By Gedung", level: 3, parentCode: "61200", accountType: "biaya", normalBalance: "debit", isHeader: false },
  { code: "61207", name: "By Kendaraan", level: 3, parentCode: "61200", accountType: "biaya", normalBalance: "debit", isHeader: false },
  { code: "61208", name: "By Listrik", level: 3, parentCode: "61200", accountType: "biaya", normalBalance: "debit", isHeader: false },
  { code: "61209", name: "By Internet", level: 3, parentCode: "61200", accountType: "biaya", normalBalance: "debit", isHeader: false },
  { code: "61210", name: "By IT", level: 3, parentCode: "61200", accountType: "biaya", normalBalance: "debit", isHeader: false },
  // Ditambahkan pasca Fase 3 Langkah 7 (Aset Tetap & Penyusutan) — COA awal (Langkah 1)
  // tidak punya akun "Beban Penyusutan" tersendiri, fixed_assets.depreciation_expense_account_id
  // sebelumnya harus dipilih dari akun biaya lain-lain yang ada. Backfill utk 4 company
  // existing ada di drizzle/migrations (migrasi data terpisah, bukan lewat fungsi ini) —
  // baris di sini HANYA berlaku utk seed company BARU, satu sumber kebenaran daftar akun.
  { code: "61211", name: "By Penyusutan", level: 3, parentCode: "61200", accountType: "biaya", normalBalance: "debit", isHeader: false },
  { code: "61300", name: "BIAYA PEMASARAN & PENGEMBANGAN BISNIS", level: 3, parentCode: "61000", accountType: "biaya", normalBalance: "debit", isHeader: true },
  { code: "61301", name: "By Pemasaran Iklan", level: 3, parentCode: "61300", accountType: "biaya", normalBalance: "debit", isHeader: false },
  { code: "61302", name: "By Pengembangan Website", level: 3, parentCode: "61300", accountType: "biaya", normalBalance: "debit", isHeader: false },
  { code: "61400", name: "BIAYA ADMINISTRASI UMUM", level: 3, parentCode: "61000", accountType: "biaya", normalBalance: "debit", isHeader: true },
  { code: "61401", name: "By Hukum & Notaris", level: 3, parentCode: "61400", accountType: "biaya", normalBalance: "debit", isHeader: false },
  { code: "61402", name: "By Akuntansi & Pajak", level: 3, parentCode: "61400", accountType: "biaya", normalBalance: "debit", isHeader: false },
  { code: "61403", name: "By Asuransi", level: 3, parentCode: "61400", accountType: "biaya", normalBalance: "debit", isHeader: false },
  { code: "61404", name: "By Akreditasi & Lisensi Lembaga", level: 3, parentCode: "61400", accountType: "biaya", normalBalance: "debit", isHeader: false },
  { code: "61405", name: "By Pajak & Retribusi", level: 3, parentCode: "61400", accountType: "biaya", normalBalance: "debit", isHeader: false },
  { code: "61406", name: "By Lain-Lain", level: 3, parentCode: "61400", accountType: "biaya", normalBalance: "debit", isHeader: false },
  { code: "61500", name: "BEBAN KEUANGAN", level: 3, parentCode: "61000", accountType: "biaya", normalBalance: "debit", isHeader: true },
  { code: "61501", name: "By Bunga Pinjaman", level: 3, parentCode: "61500", accountType: "biaya", normalBalance: "debit", isHeader: false },
  { code: "61502", name: "By Administrasi Bank", level: 3, parentCode: "61500", accountType: "biaya", normalBalance: "debit", isHeader: false },
  { code: "61503", name: "By Kerugian Piutang", level: 3, parentCode: "61500", accountType: "biaya", normalBalance: "debit", isHeader: false },
];
