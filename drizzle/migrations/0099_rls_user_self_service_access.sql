-- Pola RLS standar (tenant isolation by company_id) + 1 lapis tambahan RESTRICTIVE
-- (pola sama seperti payslips_row_level_restriction di 0043_rls_payroll_module.sql):
-- super_admin/company_admin (yang mengelola flag ini lewat form edit user) boleh
-- lihat/ubah semua baris di company-nya; role lain (department_head/staff) hanya
-- boleh lihat baris MILIKNYA SENDIRI (dipakai layout.tsx utk gate sidebar sendiri).
ALTER TABLE user_self_service_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_self_service_access FORCE ROW LEVEL SECURITY;

CREATE POLICY user_self_service_access_tenant_isolation ON user_self_service_access
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );

CREATE POLICY user_self_service_access_row_level_restriction ON user_self_service_access
  AS RESTRICTIVE
  FOR ALL
  USING (
    current_setting('app.current_role', true) IN ('super_admin', 'company_admin')
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) IN ('super_admin', 'company_admin')
  );