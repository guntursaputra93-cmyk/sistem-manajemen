-- Pola RLS standar (lihat 0059_rls_chart_of_accounts.sql) untuk ketiga tabel baru
-- Langkah 2. SENGAJA belum ada layer RESTRICTIVE row-level tambahan di sini —
-- itu reserved utk Fase 3 Langkah 10 ("RLS row-level tambahan untuk
-- journal_entries/journal_entry_lines/tabel laporan sensitif", spesifikasi
-- Bagian 2), supaya urutan langkah tidak dilompati. Pembatasan "hanya admin"
-- untuk sekarang ditegakkan app-level lewat hasPermission (VIEW_/MANAGE_JOURNAL_ENTRIES).
ALTER TABLE finance_number_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_number_sequences FORCE ROW LEVEL SECURITY;
CREATE POLICY finance_number_sequences_tenant_isolation ON finance_number_sequences
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );

ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY journal_entries_tenant_isolation ON journal_entries
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );

ALTER TABLE journal_entry_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entry_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY journal_entry_lines_tenant_isolation ON journal_entry_lines
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );
