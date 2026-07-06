-- Pola RLS standar untuk semua tabel bisnis yang punya company_id langsung:
--   - super_admin bisa lihat & kelola semua row lintas company
--   - role lain hanya bisa lihat & kelola row milik company mereka sendiri
--     (batas company_id ini adalah tanggung jawab RLS; matriks izin per-role
--      yang lebih detail, mis. staff vs department_head, dikontrol di RBAC
--      level aplikasi supaya tidak dobel didefinisikan di dua tempat)
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments FORCE ROW LEVEL SECURITY;

CREATE POLICY departments_tenant_isolation ON departments
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );