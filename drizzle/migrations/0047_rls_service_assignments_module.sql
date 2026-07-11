-- Pola RLS standar (lihat 0030_rls_opportunities_and_stage_history.sql / 0041) untuk
-- 2 tabel Fase 4 Penjadwalan: super_admin lintas company, role lain hanya company_id
-- miliknya sendiri. BUKAN row-level khusus seperti employees/payslips — visibilitas
-- "staff cuma lihat penugasan miliknya sendiri" ditegakkan di aplikasi via
-- getVisibleEmployeeIds (lihat page.tsx), bukan filter baris di DB.

ALTER TABLE service_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_assignments FORCE ROW LEVEL SECURITY;
CREATE POLICY service_assignments_tenant_isolation ON service_assignments
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );

ALTER TABLE service_assignment_team ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_assignment_team FORCE ROW LEVEL SECURITY;
CREATE POLICY service_assignment_team_tenant_isolation ON service_assignment_team
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );
