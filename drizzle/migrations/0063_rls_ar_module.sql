-- Pola RLS standar (lihat 0059_rls_chart_of_accounts.sql, 0061_rls_journal_module.sql)
-- untuk kedua tabel baru Langkah 4. SENGAJA belum ada layer RESTRICTIVE row-level
-- tambahan di sini — itu reserved utk Fase 3 Langkah 10 (spesifikasi Bagian 2:
-- "RLS row-level tambahan untuk journal_entries/journal_entry_lines/tabel laporan
-- sensitif" — ar_invoices/ar_payments masuk kategori sama). Pembatasan "hanya admin"
-- untuk sekarang ditegakkan app-level lewat hasPermission (VIEW_/MANAGE_AR_INVOICES).
ALTER TABLE ar_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE ar_invoices FORCE ROW LEVEL SECURITY;
CREATE POLICY ar_invoices_tenant_isolation ON ar_invoices
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );

ALTER TABLE ar_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ar_payments FORCE ROW LEVEL SECURITY;
CREATE POLICY ar_payments_tenant_isolation ON ar_payments
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );
