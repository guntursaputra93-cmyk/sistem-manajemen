-- Pola RLS standar yang sama dengan departments: super_admin lintas company,
-- role lain hanya lihat/kelola user di company sendiri.
--
-- CATATAN PENTING (dicatat supaya tidak lupa saat membangun NextAuth di langkah
-- berikutnya): proses LOGIN itu sendiri butuh cari user by email SEBELUM ada
-- session/company context sama sekali (ayam-telur). Query login harus pakai
-- koneksi admin (bypass RLS) khusus untuk 1 langkah itu saja — bukan lewat
-- app_user — supaya tidak mengembalikan 0 baris untuk semua orang saat login.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;

CREATE POLICY users_tenant_isolation ON users
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );