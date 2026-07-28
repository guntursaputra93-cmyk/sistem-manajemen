-- ============================================================================
-- Hardening: kunci search_path pada trigger function audit trail (Item A lanjutan)
--
-- Temuan Supabase security advisor (lint 0011_function_search_path_mutable):
-- `public.audit_trails_forbid_mutation` (dibuat di 0100) punya search_path yang
-- mutable — bisa diarahkan ulang lewat `SET search_path` di sesi pemanggil.
--
-- Dipakai `SET search_path = ''` (kosong), BUKAN 'public': fungsi ini tidak
-- mereferensikan satu pun tabel/objek skema — isinya cuma RAISE EXCEPTION —
-- jadi tidak butuh resolusi nama sama sekali. search_path kosong adalah bentuk
-- terketat dan merupakan remediasi yang didokumentasikan Supabase sendiri.
-- pg_catalog tetap implisit tersedia, sehingga RAISE/ERRCODE tetap berfungsi.
--
-- ADITIF & TIDAK MENGUBAH LOGIKA PROTEKSI: badan fungsi identik byte-per-byte
-- dengan 0100, satu-satunya tambahan adalah klausa SET. CREATE OR REPLACE
-- mempertahankan OID fungsi, jadi kedua trigger (audit_trails_no_mutation dan
-- audit_trails_no_truncate) tetap menunjuk ke fungsi yang sama dan status
-- ENABLE ALWAYS-nya tidak tersentuh — tidak ada DROP/CREATE TRIGGER di sini.
-- Policy RLS, REVOKE, dan data 273 baris juga tidak disentuh sama sekali.
-- ============================================================================

CREATE OR REPLACE FUNCTION audit_trails_forbid_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION
    'audit_trails bersifat append-only: % ditolak (jejak audit tidak boleh diubah/dihapus oleh role manapun, termasuk super_admin)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;