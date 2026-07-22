-- RLS tenant-isolation standar (pola 0061_rls_journal_module.sql) untuk 2 tabel
-- transaksi terbuka. Pembatasan "hanya admin keuangan" ditegakkan app-level lewat
-- hasPermission (VIEW_/MANAGE_JOURNAL_ENTRIES) — di sini cukup batas company_id.
ALTER TABLE open_items ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE open_items FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY open_items_tenant_isolation ON open_items
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );--> statement-breakpoint
ALTER TABLE open_item_settlements ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE open_item_settlements FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY open_item_settlements_tenant_isolation ON open_item_settlements
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );
