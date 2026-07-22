-- Pola RLS standar (lihat 0090_rls_cases_module.sql / 0094_rls_case_number_sequences.sql):
-- super_admin lintas company, role lain hanya company_id miliknya sendiri.
-- Case Management langkah 1.5 — 4 tabel pendukung.

ALTER TABLE case_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_milestones FORCE ROW LEVEL SECURITY;
CREATE POLICY case_milestones_tenant_isolation ON case_milestones
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );

ALTER TABLE case_deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_deliverables FORCE ROW LEVEL SECURITY;
CREATE POLICY case_deliverables_tenant_isolation ON case_deliverables
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );

ALTER TABLE case_external_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_external_submissions FORCE ROW LEVEL SECURITY;
CREATE POLICY case_external_submissions_tenant_isolation ON case_external_submissions
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );

ALTER TABLE case_external_submission_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_external_submission_history FORCE ROW LEVEL SECURITY;
CREATE POLICY case_external_submission_history_tenant_isolation ON case_external_submission_history
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );
