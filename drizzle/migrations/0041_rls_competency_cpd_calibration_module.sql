-- Pola RLS standar (lihat 0030_rls_opportunities_and_stage_history.sql) untuk
-- SELURUH 6 tabel di migrasi ini: super_admin lintas company, role lain hanya
-- company_id miliknya sendiri. BUKAN row-level khusus seperti employees/payslips
-- (0036/0044) — sesuai keputusan Fase 2, row-level RLS hanya untuk 2 tabel itu.
-- Batasan "staff cuma lihat kompetensi/CPD miliknya sendiri" (employee_competencies,
-- cpd_activities) ditegakkan di aplikasi via getVisibleEmployeeIds. calibration_meetings/
-- calibration_attendees TIDAK di-scope per-employee sama sekali (1 rapat bisa
-- membahas banyak karyawan) — visibilitasnya murni role gate (staff dikecualikan)
-- di RBAC (VIEW_CALIBRATION_MEETINGS), bukan filter baris.

ALTER TABLE competency_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE competency_types FORCE ROW LEVEL SECURITY;
CREATE POLICY competency_types_tenant_isolation ON competency_types
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );

ALTER TABLE employee_competencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_competencies FORCE ROW LEVEL SECURITY;
CREATE POLICY employee_competencies_tenant_isolation ON employee_competencies
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );

ALTER TABLE cpd_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE cpd_activities FORCE ROW LEVEL SECURITY;
CREATE POLICY cpd_activities_tenant_isolation ON cpd_activities
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );

ALTER TABLE cpd_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE cpd_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY cpd_settings_tenant_isolation ON cpd_settings
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );

ALTER TABLE calibration_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE calibration_meetings FORCE ROW LEVEL SECURITY;
CREATE POLICY calibration_meetings_tenant_isolation ON calibration_meetings
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );

ALTER TABLE calibration_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE calibration_attendees FORCE ROW LEVEL SECURITY;
CREATE POLICY calibration_attendees_tenant_isolation ON calibration_attendees
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );
