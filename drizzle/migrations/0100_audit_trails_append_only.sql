-- ============================================================================
-- Audit Trail APPEND-ONLY (inisiatif Kesiapan Audit Kepatuhan Data, Item A)
--
-- Sebelum ini: 1 policy `audit_trails_tenant_isolation` FOR ALL — mengizinkan
-- INSERT, SELECT, UPDATE, DAN DELETE. Jejak audit yang bisa diubah/dihapus
-- tidak kredibel di depan auditor eksternal (ISO/Kemenaker).
--
-- Sesudah: INSERT + SELECT tetap tenant-scoped PERSIS seperti sebelumnya
-- (ekspresi tidak diubah sama sekali, cuma dipecah per-command), sedangkan
-- UPDATE/DELETE/TRUNCATE ditolak untuk SEMUA role tanpa kecuali.
--
-- KENAPA BUTUH 3 LAPIS, bukan cukup RLS saja:
--   `logAudit()` (src/lib/audit/log.ts) menulis lewat dbAdmin = role `postgres`,
--   yang punya rolbypassrls=true DAN pemilik tabel ini. Untuk role semacam itu
--   RLS diabaikan total, jadi policy RLS anti-UPDATE/DELETE hanya mengikat
--   `app_user`. Role `service_role` juga bypassrls. Karena itu:
--     Lapis 1 (RLS)     : mengikat app_user + anon + authenticated.
--     Lapis 2 (REVOKE)  : mencabut hak di level privilege, bukan cuma policy.
--     Lapis 3 (TRIGGER) : SATU-SATUNYA lapis yang mengikat role bypassrls dan
--                         pemilik tabel — trigger tetap dieksekusi untuk mereka.
--   TRUNCATE sengaja ikut ditutup: TRUNCATE melewati RLS dan melewati trigger
--   baris (UPDATE/DELETE), jadi tanpa ini seluruh isi tabel masih bisa dihapus
--   sekali jalan.
--
-- TIDAK menyentuh data yang sudah ada (273 baris, termasuk 74 baris
-- entity_type NULL yang diperbaiki di item terpisah).
-- ============================================================================

-- --- Lapis 1: RLS per-command ------------------------------------------------
-- Policy lama FOR ALL dibuang, diganti 2 policy yang ekspresinya IDENTIK dengan
-- yang lama tapi dibatasi ke SELECT dan INSERT saja.
DROP POLICY IF EXISTS audit_trails_tenant_isolation ON audit_trails;

CREATE POLICY audit_trails_select ON audit_trails
  FOR SELECT
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );

CREATE POLICY audit_trails_insert ON audit_trails
  FOR INSERT
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );

-- Tanpa policy permissive untuk UPDATE/DELETE, keduanya sudah otomatis ditolak.
-- Policy RESTRICTIVE eksplisit di bawah ditambahkan supaya niatnya terbaca jelas
-- saat auditor membaca skema (self-documenting), bukan tersirat dari ketiadaan.
CREATE POLICY audit_trails_no_update ON audit_trails
  AS RESTRICTIVE
  FOR UPDATE
  USING (false)
  WITH CHECK (false);

CREATE POLICY audit_trails_no_delete ON audit_trails
  AS RESTRICTIVE
  FOR DELETE
  USING (false);

-- --- Lapis 2: cabut privilege ------------------------------------------------
-- Hanya untuk tabel ini; ALTER DEFAULT PRIVILEGES di 0001 (yang memberi
-- UPDATE/DELETE ke app_user untuk tabel baru) sengaja dibiarkan utuh.
REVOKE UPDATE, DELETE, TRUNCATE ON audit_trails FROM app_user;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_trails FROM anon;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_trails FROM authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_trails FROM service_role;

-- --- Lapis 3: trigger (mengikat role bypassrls & pemilik tabel) --------------
CREATE OR REPLACE FUNCTION audit_trails_forbid_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'audit_trails bersifat append-only: % ditolak (jejak audit tidak boleh diubah/dihapus oleh role manapun, termasuk super_admin)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS audit_trails_no_mutation ON audit_trails;
CREATE TRIGGER audit_trails_no_mutation
  BEFORE UPDATE OR DELETE ON audit_trails
  FOR EACH ROW
  EXECUTE FUNCTION audit_trails_forbid_mutation();

DROP TRIGGER IF EXISTS audit_trails_no_truncate ON audit_trails;
CREATE TRIGGER audit_trails_no_truncate
  BEFORE TRUNCATE ON audit_trails
  FOR EACH STATEMENT
  EXECUTE FUNCTION audit_trails_forbid_mutation();

-- ENABLE ALWAYS: tanpa ini trigger tidak jalan saat session_replication_role
-- di-set ke 'replica' — celah yang membuat penghapusan senyap masih mungkin.
ALTER TABLE audit_trails ENABLE ALWAYS TRIGGER audit_trails_no_mutation;
ALTER TABLE audit_trails ENABLE ALWAYS TRIGGER audit_trails_no_truncate;