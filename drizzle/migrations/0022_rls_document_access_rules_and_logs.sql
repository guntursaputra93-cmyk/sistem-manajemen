-- Pola RLS standar (lihat 0003_rls_departments.sql): super_admin lintas company,
-- role lain hanya company_id miliknya sendiri.
ALTER TABLE document_access_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_access_rules FORCE ROW LEVEL SECURITY;
CREATE POLICY document_access_rules_tenant_isolation ON document_access_rules
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );

ALTER TABLE document_access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_access_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY document_access_logs_tenant_isolation ON document_access_logs
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );