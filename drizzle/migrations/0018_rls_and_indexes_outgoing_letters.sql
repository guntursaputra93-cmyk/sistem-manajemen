-- Pola RLS standar (lihat 0003_rls_departments.sql): super_admin lintas company,
-- role lain hanya company_id miliknya sendiri.
ALTER TABLE outgoing_letters ENABLE ROW LEVEL SECURITY;
ALTER TABLE outgoing_letters FORCE ROW LEVEL SECURITY;
CREATE POLICY outgoing_letters_tenant_isolation ON outgoing_letters
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );

-- Unique parsial: nomor surat cuma wajib unik SETELAH final (banyak draft boleh
-- sama-sama NULL, itu bukan pelanggaran keunikan nomor resmi).
CREATE UNIQUE INDEX outgoing_letters_company_letter_number_unique
  ON outgoing_letters (company_id, letter_number)
  WHERE letter_number IS NOT NULL;