-- Pola RLS standar (lihat 0030_rls_opportunities_and_stage_history.sql / 0043
-- salary_components): super_admin lintas company, role lain hanya company_id
-- miliknya sendiri. TIDAK ditambah layer RESTRICTIVE row-level seperti
-- employees/payslips (0036/0043) — chart_of_accounts adalah data referensi/setup
-- admin per company (nama & kode akun), bukan data ber-baris-per-karyawan yang
-- butuh dipersempit lagi ke satu user tertentu. Sama seperti salary_components,
-- pembatasan "hanya admin yang boleh akses" ditegakkan di app layer lewat
-- hasPermission (VIEW_CHART_OF_ACCOUNTS/MANAGE_CHART_OF_ACCOUNTS, keduanya
-- super_admin+company_admin saja, tidak ada staff/department_head) — bukan RLS,
-- karena staff tetap berada di company yang sama, RLS company-only ini memang
-- tidak dirancang untuk membedakan role di dalam 1 company yang sama.
ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE chart_of_accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY chart_of_accounts_tenant_isolation ON chart_of_accounts
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );
