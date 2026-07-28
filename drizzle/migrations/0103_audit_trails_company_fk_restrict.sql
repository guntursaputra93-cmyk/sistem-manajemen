-- audit_trails.company_id: ON DELETE SET NULL -> ON DELETE RESTRICT.
--
-- ALASAN: sejak audit_trails append-only (0100), SET NULL tidak bisa lagi
-- dieksekusi saat company dihapus (trigger menolak UPDATE), sehingga company
-- yang punya jejak audit terblokir dengan pesan error yang menyesatkan.
-- RESTRICT menjadikan larangan itu eksplisit & pesannya tepat. Efek praktis
-- sama (company tetap tidak bisa dihapus), tapi kini itu keputusan yang
-- terbaca di skema, bukan efek samping kebetulan.
--
-- Beda perlakuan dengan user_id di 0102 (FK dilepas) memang disengaja: company
-- adalah tenant produksi yang tidak pernah dihapus, jadi yang dibutuhkan di sini
-- larangan tegas; sedangkan user perlu tetap bisa dihapus (offboarding).
--
-- Data, kolom, dan nullability TIDAK berubah — hanya aksi ON DELETE.
ALTER TABLE "audit_trails" DROP CONSTRAINT "audit_trails_company_id_companies_id_fk";
--> statement-breakpoint
ALTER TABLE "audit_trails" ADD CONSTRAINT "audit_trails_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;