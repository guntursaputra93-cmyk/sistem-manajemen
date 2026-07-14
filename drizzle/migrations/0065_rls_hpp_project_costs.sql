-- Pola RLS standar (lihat 0059_rls_chart_of_accounts.sql, 0063_rls_ar_module.sql)
-- untuk tabel baru Langkah 5. SENGAJA belum ada layer RESTRICTIVE row-level
-- tambahan di sini — reserved utk Fase 3 Langkah 10. Pembatasan "hanya admin"
-- untuk sekarang ditegakkan app-level lewat hasPermission (VIEW_/MANAGE_HPP_PROJECT_COSTS).
ALTER TABLE hpp_project_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE hpp_project_costs FORCE ROW LEVEL SECURITY;
CREATE POLICY hpp_project_costs_tenant_isolation ON hpp_project_costs
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );
