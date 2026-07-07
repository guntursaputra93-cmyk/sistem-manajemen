-- Pola RLS standar (lihat 0003_rls_departments.sql): super_admin lintas company,
-- role lain hanya company_id miliknya sendiri.
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
CREATE POLICY organizations_tenant_isolation ON organizations
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );

ALTER TABLE organization_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_contacts FORCE ROW LEVEL SECURITY;
CREATE POLICY organization_contacts_tenant_isolation ON organization_contacts
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );