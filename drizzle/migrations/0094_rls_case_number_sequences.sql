-- Pola RLS standar (lihat 0016 agenda_number_sequences / 0010 letter_number_sequences):
-- super_admin lintas company, role lain hanya company_id miliknya sendiri.
-- Case Management langkah 1.4 — tabel counter nomor case.
ALTER TABLE case_number_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_number_sequences FORCE ROW LEVEL SECURITY;
CREATE POLICY case_number_sequences_tenant_isolation ON case_number_sequences
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );
