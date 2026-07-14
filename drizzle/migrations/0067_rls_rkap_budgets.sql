-- Pola RLS standar (lihat 0059_rls_chart_of_accounts.sql, 0065_rls_hpp_project_costs.sql)
-- untuk kedua tabel baru Langkah 6. SENGAJA belum ada layer RESTRICTIVE row-level
-- tambahan di sini — reserved utk Fase 3 Langkah 10. Pembatasan "hanya admin"
-- untuk sekarang ditegakkan app-level lewat hasPermission (VIEW_/MANAGE_RKAP_BUDGETS).
ALTER TABLE rkap_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE rkap_budgets FORCE ROW LEVEL SECURITY;
CREATE POLICY rkap_budgets_tenant_isolation ON rkap_budgets
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );

ALTER TABLE rkap_budget_monthly ENABLE ROW LEVEL SECURITY;
ALTER TABLE rkap_budget_monthly FORCE ROW LEVEL SECURITY;
CREATE POLICY rkap_budget_monthly_tenant_isolation ON rkap_budget_monthly
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );
