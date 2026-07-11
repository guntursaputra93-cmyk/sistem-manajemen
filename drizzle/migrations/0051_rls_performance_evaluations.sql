-- Pola RLS standar (lihat 0041/0047/0049) — company-level, bukan row-level.
-- Visibilitas "staff cuma lihat evaluasi terkait dirinya" ditegakkan di aplikasi
-- lewat getVisibleEmployeeIds pada assignment terkait ([id]/page.tsx), bukan
-- filter baris di DB.

ALTER TABLE performance_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_evaluations FORCE ROW LEVEL SECURITY;
CREATE POLICY performance_evaluations_tenant_isolation ON performance_evaluations
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );
