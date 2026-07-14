-- Pola RLS standar (lihat 0059_rls_chart_of_accounts.sql, 0067_rls_rkap_budgets.sql)
-- untuk kedua tabel baru Langkah 7. SENGAJA belum ada layer RESTRICTIVE row-level
-- tambahan di sini — reserved utk Fase 3 Langkah 10. Pembatasan "hanya admin"
-- untuk sekarang ditegakkan app-level lewat hasPermission (VIEW_/MANAGE_FIXED_ASSETS).
ALTER TABLE fixed_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixed_assets FORCE ROW LEVEL SECURITY;
CREATE POLICY fixed_assets_tenant_isolation ON fixed_assets
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );

ALTER TABLE depreciation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE depreciation_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY depreciation_runs_tenant_isolation ON depreciation_runs
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );
