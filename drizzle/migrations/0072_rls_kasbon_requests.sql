-- Pola RLS standar (baseline) + lapisan RESTRICTIVE row-level tambahan (lihat
-- 0036_rls_employees_and_position_history.sql) — kasbon_requests SENGAJA masuk
-- kategori sama seperti employees: kalau ada query baru yang lupa scoping app-level,
-- DB-nya sendiri tetap menahan. Beda dari employees: WITH CHECK RESTRICTIVE di sini
-- TIDAK admin-only — staff/department_head memang perlu bisa INSERT baris miliknya
-- sendiri (mengajukan kasbon), pola sama seperti leave_requests tapi dengan
-- pembatasan row-level tambahan yang leave_requests tidak punya (kasbon finansial,
-- leave_requests tidak). Approve/reject/disbursement tetap admin-only, ditegakkan
-- app-level lewat hasPermission (MANAGE_KASBON_REQUESTS), bukan lewat RLS (RLS tidak
-- bisa membedakan "ini INSERT pengajuan baru" vs "ini UPDATE approve" pada baris yang
-- sama-sama dimiliki dirinya sendiri).
ALTER TABLE kasbon_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE kasbon_requests FORCE ROW LEVEL SECURITY;

CREATE POLICY kasbon_requests_tenant_isolation ON kasbon_requests
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );

CREATE POLICY kasbon_requests_row_level_restriction ON kasbon_requests
  AS RESTRICTIVE
  FOR ALL
  USING (
    current_setting('app.current_role', true) IN ('super_admin', 'company_admin')
    OR employee_id = (
      SELECT e.id FROM employees e
      WHERE e.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    )
  )
  WITH CHECK (
    current_setting('app.current_role', true) IN ('super_admin', 'company_admin')
    OR employee_id = (
      SELECT e.id FROM employees e
      WHERE e.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    )
  );
