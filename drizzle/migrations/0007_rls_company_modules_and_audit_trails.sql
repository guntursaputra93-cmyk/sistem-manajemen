-- company_modules: pola tenant-isolation standar yang sama.
ALTER TABLE company_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_modules FORCE ROW LEVEL SECURITY;

CREATE POLICY company_modules_tenant_isolation ON company_modules
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );

-- audit_trails: pola tenant-isolation standar juga.
-- CATATAN: entry audit untuk login/login_failed ditulis LEWAT KONEKSI ADMIN
-- (bukan app_user), sama seperti alasan di 0005_rls_users.sql — pada momen
-- login, belum ada session/company context sama sekali untuk dicocokkan RLS.
-- Jadi kolom company_id boleh NULL di baris seperti itu, tapi baris itu tidak
-- pernah lewat app_user, jadi policy di bawah ini tidak perlu mengakomodasi NULL.
ALTER TABLE audit_trails ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_trails FORCE ROW LEVEL SECURITY;

CREATE POLICY audit_trails_tenant_isolation ON audit_trails
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );

-- rate_limits: sengaja TIDAK ada dimensi company_id (lihat komentar di
-- schema rateLimits.ts) — operasinya murni berdasarkan identifier (email),
-- termasuk sebelum kita tahu email itu terdaftar di company mana. Tetap
-- diberi RLS + policy eksplisit (bukan dibiarkan tanpa RLS) supaya jelas ini
-- keputusan sadar, bukan tabel yang "belum sempat" diberi RLS.
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits FORCE ROW LEVEL SECURITY;

CREATE POLICY rate_limits_allow_app ON rate_limits
  FOR ALL
  USING (true)
  WITH CHECK (true);