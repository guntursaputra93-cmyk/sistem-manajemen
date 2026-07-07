-- Pola RLS standar (lihat 0003_rls_departments.sql): super_admin lintas company,
-- role lain hanya company_id miliknya sendiri.
ALTER TABLE dashboard_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY dashboard_settings_tenant_isolation ON dashboard_settings
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );