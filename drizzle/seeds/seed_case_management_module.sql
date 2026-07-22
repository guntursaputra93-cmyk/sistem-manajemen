-- Seed data (BUKAN migration skema) — Case Management langkah 1.2, bagian 3.
-- Sengaja DILETAKKAN DI LUAR drizzle/migrations/ + _journal.json supaya TIDAK ikut
-- dijalankan otomatis oleh `drizzle-kit migrate`. Jalankan MANUAL sekali setelah
-- migration 0089-0092 masuk ke database (mis. lewat Supabase SQL editor / psql,
-- pakai role yang bypass RLS seperti postgres/service_role).
--
-- Mendaftarkan modul 'case_management' untuk SEMUA company yang sudah ada, default
-- OFF (is_enabled=false) — diaktifkan manual per company nanti.
--
-- IDEMPOTENT: aman dijalankan berkali-kali. ON CONFLICT DO NOTHING mengandalkan
-- unique (company_id, module_key) — tidak pernah menimpa/mengubah baris yang sudah
-- ada, hanya menambah baris baru untuk company yang belum punya entri ini.

INSERT INTO company_modules (company_id, module_key, is_enabled, terminology_config)
SELECT id, 'case_management', false, '{}'::jsonb
FROM companies
ON CONFLICT (company_id, module_key) DO NOTHING;
