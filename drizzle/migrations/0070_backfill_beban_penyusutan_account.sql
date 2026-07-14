-- Migrasi DATA (bukan skema) — backfill akun 61211 "By Penyusutan" ke SEMUA company
-- existing yang sudah lewat titik seed awal (Langkah 1), menyusul kebutuhan
-- fixed_assets.depreciation_expense_account_id di Langkah 7 (Aset Tetap & Penyusutan).
-- Company BARU ke depan sudah otomatis dapat akun ini lewat CHART_OF_ACCOUNTS_SEED
-- (src/lib/finance/chartOfAccountsSeed.ts) — satu sumber kebenaran daftar akun, migrasi
-- ini HANYA untuk company yang sudah ada sebelum baris itu ditambahkan ke seed.
--
-- Idempoten (aman dijalankan ulang): WHERE NOT EXISTS mengecualikan company yang
-- sudah punya kode 61211 (mis. kalau migrasi ini pernah jalan sebagian atau admin
-- sudah menambahkannya manual lewat halaman Kelola Akun).
INSERT INTO chart_of_accounts (company_id, code, name, level, parent_id, account_type, normal_balance, is_header)
SELECT c.id, '61211', 'By Penyusutan', 3, parent.id, 'biaya', 'debit', false
FROM companies c
JOIN chart_of_accounts parent ON parent.company_id = c.id AND parent.code = '61200'
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts existing WHERE existing.company_id = c.id AND existing.code = '61211'
);
