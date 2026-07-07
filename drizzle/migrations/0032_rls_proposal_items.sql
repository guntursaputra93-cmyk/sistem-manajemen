-- Pola RLS standar (lihat 0030_rls_opportunities_and_stage_history.sql): super_admin
-- lintas company, role lain hanya company_id miliknya sendiri.
ALTER TABLE proposal_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal_items FORCE ROW LEVEL SECURITY;
CREATE POLICY proposal_items_tenant_isolation ON proposal_items
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );
