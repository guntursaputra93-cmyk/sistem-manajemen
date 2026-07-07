-- Pola RLS standar (lihat 0003_rls_departments.sql): super_admin lintas company,
-- role lain hanya company_id miliknya sendiri.
ALTER TABLE letter_number_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE letter_number_sequences FORCE ROW LEVEL SECURITY;

CREATE POLICY letter_number_sequences_tenant_isolation ON letter_number_sequences
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );