-- Pola RLS standar (lihat 0030_rls_opportunities_and_stage_history.sql): super_admin
-- lintas company, role lain hanya company_id miliknya sendiri.
ALTER TABLE position_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE position_history FORCE ROW LEVEL SECURITY;
CREATE POLICY position_history_tenant_isolation ON position_history
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );

-- ============================================================================
-- DEVIATION DARI KONVENSI STANDAR: setiap tabel lain di aplikasi ini HANYA
-- menegakkan RLS di level company_id (lihat semua migrasi *_rls_*.sql sebelumnya);
-- batasan "hanya lihat baris miliknya sendiri" SELALU ditegakkan di kode aplikasi
-- (pola getVisibleAssigneeIds di lib/crm/opportunities.ts), TIDAK PERNAH lewat RLS.
--
-- employees adalah pengecualian yang disengaja: tabel ini menyimpan NIK, kategori
-- PII paling sensitif di sistem ini. Kita menambahkan lapisan RLS row-level SEBAGAI
-- TAMBAHAN (bukan pengganti) pola company-only di atas, supaya kalau suatu saat ada
-- query baru yang lupa menerapkan filter app-level, data tetap tidak bocor karena
-- DB-nya sendiri menahan.
--
-- Ini butuh GUC sesi baru, app.current_user_id, di-set oleh withTenantContext()
-- (lihat src/lib/db/index.ts) — opsional & backward-compatible, no-op untuk semua
-- tabel lain yang tidak mereferensikannya.
--
-- Mekanisme: 2 policy terpisah, bukan 1 policy gabungan. Postgres menggabungkan
-- multiple policy sebagai (OR semua PERMISSIVE) AND (AND semua RESTRICTIVE).
-- Policy company-only di atas tetap PERMISSIVE (baseline, tidak berubah dari pola
-- semua tabel lain). Policy kedua di bawah ini AS RESTRICTIVE — meng-AND-kan
-- pembatasan row-level di atas baseline itu:
--   - super_admin/company_admin: tanpa batas tambahan (selain company-only di atas)
--   - department_head: hanya baris karyawan di department_id miliknya sendiri
--     (resolved via subquery ke users, dicocokkan dari app.current_user_id)
--   - selain itu (staff): hanya baris employees miliknya sendiri (user_id cocok)
-- WITH CHECK sengaja LEBIH SEMPIT dari USING: hanya super_admin/company_admin yang
-- boleh menulis (MANAGE_EMPLOYEES di rbac/permissions.ts memang admin-only) — jadi
-- kalaupun suatu saat ada bug yang salah memberi izin department_head/staff menulis
-- di level aplikasi, DB tetap menolak.
-- ============================================================================
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees FORCE ROW LEVEL SECURITY;

CREATE POLICY employees_tenant_isolation ON employees
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );

CREATE POLICY employees_row_level_restriction ON employees
  AS RESTRICTIVE
  FOR ALL
  USING (
    current_setting('app.current_role', true) IN ('super_admin', 'company_admin')
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    OR (
      current_setting('app.current_role', true) = 'department_head'
      AND department_id = (
        SELECT u.department_id FROM users u
        WHERE u.id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
      )
    )
  )
  WITH CHECK (
    current_setting('app.current_role', true) IN ('super_admin', 'company_admin')
  );
