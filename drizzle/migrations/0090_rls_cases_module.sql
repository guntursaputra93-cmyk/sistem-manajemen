-- Pola RLS standar (lihat 0034_rls_contracts_and_activities.sql /
-- 0047_rls_service_assignments_module.sql): super_admin lintas company, role lain
-- hanya company_id miliknya sendiri. Case Management langkah 1.1 — 3 tabel inti.
-- Batasan visibilitas per-PIC/per-staff (kalau ada) ditegakkan di aplikasi, bukan RLS,
-- sama seperti opportunities/contracts/service_assignments.

ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE cases FORCE ROW LEVEL SECURITY;
CREATE POLICY cases_tenant_isolation ON cases
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );

ALTER TABLE case_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_stage_history FORCE ROW LEVEL SECURITY;
CREATE POLICY case_stage_history_tenant_isolation ON case_stage_history
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );

ALTER TABLE case_service_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_service_assignments FORCE ROW LEVEL SECURITY;
CREATE POLICY case_service_assignments_tenant_isolation ON case_service_assignments
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );
