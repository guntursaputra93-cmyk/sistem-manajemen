-- Pola RLS standar (lihat 0059_rls_chart_of_accounts.sql, 0072_rls_kasbon_requests.sql
-- baseline permissive-nya) untuk kedua tabel baru Langkah 9. SENGAJA belum ada layer
-- RESTRICTIVE row-level tambahan di sini — reserved utk Fase 3 Langkah 10. Pembatasan
-- "hanya admin" untuk sekarang ditegakkan app-level lewat hasPermission
-- (VIEW_/MANAGE_BANK_RECONCILIATIONS).
ALTER TABLE bank_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_reconciliations FORCE ROW LEVEL SECURITY;
CREATE POLICY bank_reconciliations_tenant_isolation ON bank_reconciliations
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );

ALTER TABLE bank_reconciliation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_reconciliation_items FORCE ROW LEVEL SECURITY;
CREATE POLICY bank_reconciliation_items_tenant_isolation ON bank_reconciliation_items
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );
