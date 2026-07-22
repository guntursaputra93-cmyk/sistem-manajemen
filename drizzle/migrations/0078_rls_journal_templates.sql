-- RLS tenant-isolation standar (pola 0061_rls_journal_module.sql) untuk 2 tabel
-- template. Sama seperti journal_entries/journal_entry_lines saat baru dibuat:
-- pembatasan "hanya admin" ditegakkan app-level lewat hasPermission
-- (VIEW_/MANAGE_JOURNAL_ENTRIES) — di sini cukup batas company_id.
ALTER TABLE journal_templates ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE journal_templates FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY journal_templates_tenant_isolation ON journal_templates
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );--> statement-breakpoint
ALTER TABLE journal_template_lines ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE journal_template_lines FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY journal_template_lines_tenant_isolation ON journal_template_lines
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );
