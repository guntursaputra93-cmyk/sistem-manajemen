-- RLS untuk modul Hutang (AP). Dua lapis, PERSIS pola AR (0063_rls_ar_module.sql +
-- 0076_rls_row_level_sensitive_finance.sql):
--   1. tenant isolation  — batas company_id
--   2. row-level restriction — hanya super_admin & company_admin yang boleh menyentuh
--      data finansial ini (staf biasa tidak, meski satu company)
ALTER TABLE ap_bills ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE ap_bills FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY ap_bills_tenant_isolation ON ap_bills
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );--> statement-breakpoint
CREATE POLICY ap_bills_row_level_restriction ON ap_bills
  FOR ALL
  USING (current_setting('app.current_role', true) = ANY (ARRAY['super_admin', 'company_admin']))
  WITH CHECK (current_setting('app.current_role', true) = ANY (ARRAY['super_admin', 'company_admin']));--> statement-breakpoint
ALTER TABLE ap_payments ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE ap_payments FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY ap_payments_tenant_isolation ON ap_payments
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.current_role', true) = 'super_admin'
    OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );--> statement-breakpoint
CREATE POLICY ap_payments_row_level_restriction ON ap_payments
  FOR ALL
  USING (current_setting('app.current_role', true) = ANY (ARRAY['super_admin', 'company_admin']))
  WITH CHECK (current_setting('app.current_role', true) = ANY (ARRAY['super_admin', 'company_admin']));
