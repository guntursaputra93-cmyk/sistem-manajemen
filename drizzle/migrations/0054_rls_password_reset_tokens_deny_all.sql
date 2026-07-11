-- password_reset_tokens: DENY SEMUA akses langsung, termasuk dari role app_user
-- (role yang dipakai db/withTenantContext) — tabel ini HANYA boleh diakses lewat
-- dbAdmin (role postgres, bypass RLS by design, lihat lib/db/index.ts), persis
-- seperti lookup user saat login: belum ada session/company context untuk
-- dicocokkan RLS company-scoped biasa, dan token ini juga BUKAN data per-company.
--
-- SENGAJA TIDAK ada satupun CREATE POLICY di bawah ini — ENABLE + FORCE ROW
-- LEVEL SECURITY tanpa policy sama sekali = deny SEMUA baris untuk role manapun
-- KECUALI superuser (role postgres di balik dbAdmin, yang selalu bypass RLS
-- apapun keadaan FORCE-nya). Ini keputusan desain (lihat spesifikasi Bagian 2),
-- bukan migrasi yang belum selesai — jangan tambah policy "permissive" apapun
-- ke tabel ini nanti.
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens FORCE ROW LEVEL SECURITY;
