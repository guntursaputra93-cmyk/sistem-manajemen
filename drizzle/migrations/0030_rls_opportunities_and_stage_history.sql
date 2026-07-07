-- Pola RLS standar (lihat 0003_rls_departments.sql): super_admin lintas company,
-- role lain hanya company_id miliknya sendiri. Catatan: batasan staff-hanya-
-- lihat-miliknya-sendiri dan department_head-hanya-departemennya DITEGAKKAN DI
-- APLIKASI (lib/crm/opportunities.ts), bukan RLS — RLS di sini cuma menjaga
-- batas company_id seperti semua tabel lain.
ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunities FORCE ROW LEVEL SECURITY;
CREATE POLICY opportunities_tenant_isolation ON opportunities
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );

ALTER TABLE opportunity_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunity_stage_history FORCE ROW LEVEL SECURITY;
CREATE POLICY opportunity_stage_history_tenant_isolation ON opportunity_stage_history
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );