-- Pola RLS standar untuk salary_components, employee_salary_structures, payroll_runs
-- (lihat 0030_rls_opportunities_and_stage_history.sql).
ALTER TABLE salary_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_components FORCE ROW LEVEL SECURITY;
CREATE POLICY salary_components_tenant_isolation ON salary_components
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );

ALTER TABLE employee_salary_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_salary_structures FORCE ROW LEVEL SECURITY;
CREATE POLICY employee_salary_structures_tenant_isolation ON employee_salary_structures
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );

ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY payroll_runs_tenant_isolation ON payroll_runs
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );

-- ============================================================================
-- payslips: SAMA seperti employees (0036) — RLS row-level TAMBAHAN karena berisi
-- data gaji, PII paling sensitif kedua setelah NIK. TAPI beda dari employees:
-- TIDAK ADA cabang department_head sama sekali (keputusan Fase 2: department_head
-- hanya boleh lihat slip gajinya SENDIRI, bukan gaji tim — gaji adalah data
-- lebih sensitif daripada sekadar "siapa karyawan di departemen saya", jadi
-- visibilitas payslips SENGAJA lebih sempit daripada visibilitas employees).
-- Resolusi employeeId->userId lewat subquery ke employees (payslips sendiri
-- tidak punya user_id).
-- ============================================================================
ALTER TABLE payslips ENABLE ROW LEVEL SECURITY;
ALTER TABLE payslips FORCE ROW LEVEL SECURITY;

CREATE POLICY payslips_tenant_isolation ON payslips
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );

CREATE POLICY payslips_row_level_restriction ON payslips
  AS RESTRICTIVE
  FOR ALL
  USING (
    current_setting('app.current_role', true) IN ('super_admin', 'company_admin')
    OR EXISTS (
      SELECT 1 FROM employees e
      WHERE e.id = payslips.employee_id
        AND e.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    )
  )
  WITH CHECK (
    current_setting('app.current_role', true) IN ('super_admin', 'company_admin')
  );
