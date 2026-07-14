-- Fase 3 Langkah 10 — RLS row-level RESTRICTIVE tambahan (pola sama seperti
-- 0036_rls_employees_and_position_history.sql) untuk 8 tabel Keuangan paling
-- sensitif: journal_entries, journal_entry_lines, ar_invoices, ar_payments,
-- hpp_project_costs, rkap_budgets, fixed_assets, bank_reconciliations.
--
-- BEDA dari employees (yang punya jalur "staff lihat baris miliknya sendiri" dan
-- "department_head lihat 1 departemen"): 8 tabel ini TIDAK punya konsep kepemilikan
-- individual sama sekali — VIEW_* permission app-level untuk SEMUANYA sudah
-- super_admin/company_admin only (lihat rbac/permissions.ts), jadi policy RESTRICTIVE
-- di sini murni "kalau bukan admin, tolak semua baris tanpa kecuali", sebagai
-- pertahanan lapis DB kalau suatu saat ada bug di filter hasPermission level aplikasi.
--
-- kasbon_requests SENGAJA TIDAK disentuh migrasi ini — policy row-level-nya
-- (staff/department_head lihat baris miliknya sendiri via employee_id) sudah
-- dipasang di 0072_rls_kasbon_requests.sql, tetap seperti itu (kasbon adalah
-- pengecualian: staff/department_head MEMANG boleh akses, hanya dibatasi ke
-- baris miliknya sendiri, bukan diblokir total seperti 8 tabel di bawah ini).

ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY journal_entries_row_level_restriction ON journal_entries
  AS RESTRICTIVE
  FOR ALL
  USING (current_setting('app.current_role', true) IN ('super_admin', 'company_admin'))
  WITH CHECK (current_setting('app.current_role', true) IN ('super_admin', 'company_admin'));

ALTER TABLE journal_entry_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY journal_entry_lines_row_level_restriction ON journal_entry_lines
  AS RESTRICTIVE
  FOR ALL
  USING (current_setting('app.current_role', true) IN ('super_admin', 'company_admin'))
  WITH CHECK (current_setting('app.current_role', true) IN ('super_admin', 'company_admin'));

ALTER TABLE ar_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY ar_invoices_row_level_restriction ON ar_invoices
  AS RESTRICTIVE
  FOR ALL
  USING (current_setting('app.current_role', true) IN ('super_admin', 'company_admin'))
  WITH CHECK (current_setting('app.current_role', true) IN ('super_admin', 'company_admin'));

ALTER TABLE ar_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY ar_payments_row_level_restriction ON ar_payments
  AS RESTRICTIVE
  FOR ALL
  USING (current_setting('app.current_role', true) IN ('super_admin', 'company_admin'))
  WITH CHECK (current_setting('app.current_role', true) IN ('super_admin', 'company_admin'));

ALTER TABLE hpp_project_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY hpp_project_costs_row_level_restriction ON hpp_project_costs
  AS RESTRICTIVE
  FOR ALL
  USING (current_setting('app.current_role', true) IN ('super_admin', 'company_admin'))
  WITH CHECK (current_setting('app.current_role', true) IN ('super_admin', 'company_admin'));

ALTER TABLE rkap_budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY rkap_budgets_row_level_restriction ON rkap_budgets
  AS RESTRICTIVE
  FOR ALL
  USING (current_setting('app.current_role', true) IN ('super_admin', 'company_admin'))
  WITH CHECK (current_setting('app.current_role', true) IN ('super_admin', 'company_admin'));

ALTER TABLE fixed_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixed_assets_row_level_restriction ON fixed_assets
  AS RESTRICTIVE
  FOR ALL
  USING (current_setting('app.current_role', true) IN ('super_admin', 'company_admin'))
  WITH CHECK (current_setting('app.current_role', true) IN ('super_admin', 'company_admin'));

ALTER TABLE bank_reconciliations ENABLE ROW LEVEL SECURITY;
CREATE POLICY bank_reconciliations_row_level_restriction ON bank_reconciliations
  AS RESTRICTIVE
  FOR ALL
  USING (current_setting('app.current_role', true) IN ('super_admin', 'company_admin'))
  WITH CHECK (current_setting('app.current_role', true) IN ('super_admin', 'company_admin'));
