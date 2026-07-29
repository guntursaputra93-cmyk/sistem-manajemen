-- Pola RLS tenant-isolation standar, sama persis dengan tabel modul lain
-- (lihat 0043_rls_payroll_module.sql). Kedua tabel AUDIT-E1 hanya diakses
-- super_admin/company_admin di level aplikasi, tapi RLS tetap dipasang sebagai
-- pertahanan berlapis di level database.
ALTER TABLE practitioner_eligibility_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE practitioner_eligibility_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY practitioner_eligibility_settings_tenant_isolation ON practitioner_eligibility_settings
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );

ALTER TABLE practitioner_eligibility_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE practitioner_eligibility_evaluations FORCE ROW LEVEL SECURITY;
CREATE POLICY practitioner_eligibility_evaluations_tenant_isolation ON practitioner_eligibility_evaluations
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );