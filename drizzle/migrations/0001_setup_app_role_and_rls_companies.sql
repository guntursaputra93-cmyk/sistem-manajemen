-- Role aplikasi yang dipakai Next.js untuk SEMUA query runtime (bukan migrasi).
-- Ini BUKAN superuser dan BUKAN bypass RLS — beda dari role 'postgres' bawaan
-- Supabase yang otomatis bypass semua RLS policy. Tanpa role terpisah ini,
-- RLS yang dibuat di bawah tidak akan pernah benar-benar dicek oleh Postgres.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user WITH LOGIN PASSWORD 'eTQAIKVXOTECucXZpcb9uGkJdDhGH86' NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;

-- RLS untuk companies:
--   - super_admin (session var app.current_role) bisa lihat SEMUA company
--   - role lain hanya bisa lihat company miliknya sendiri (app.current_company_id)
--   - hanya super_admin yang bisa create/update/delete company
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies FORCE ROW LEVEL SECURITY;

CREATE POLICY companies_select ON companies
  FOR SELECT
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );

CREATE POLICY companies_write ON companies
  FOR ALL
  USING (current_setting('app.current_role', true) = 'super_admin')
  WITH CHECK (current_setting('app.current_role', true) = 'super_admin');