-- Pola RLS standar (lihat 0003_rls_departments.sql): super_admin lintas company,
-- role lain hanya company_id miliknya sendiri.
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_stages FORCE ROW LEVEL SECURITY;
CREATE POLICY pipeline_stages_tenant_isolation ON pipeline_stages
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );