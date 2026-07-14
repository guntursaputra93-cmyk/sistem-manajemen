CREATE TYPE "public"."ar_invoice_status" AS ENUM('draft', 'belum_dibayar', 'sebagian', 'lunas', 'jatuh_tempo');--> statement-breakpoint
ALTER TYPE "public"."finance_sequence_type" ADD VALUE 'invoice';--> statement-breakpoint
CREATE TABLE "ar_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"invoice_number" text,
	"invoice_date" date NOT NULL,
	"due_date" date NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"revenue_account_id" uuid NOT NULL,
	"description" text,
	"status" "ar_invoice_status" DEFAULT 'draft' NOT NULL,
	"journal_entry_id" uuid,
	"created_by" uuid,
	"posted_by" uuid,
	"posted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ar_invoices_company_invoice_number_unique" UNIQUE("company_id","invoice_number"),
	CONSTRAINT "ar_invoices_amount_positive" CHECK ("ar_invoices"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "ar_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"payment_date" date NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"reference_note" text,
	"journal_entry_id" uuid NOT NULL,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ar_payments_amount_positive" CHECK ("ar_payments"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "ar_invoices" ADD CONSTRAINT "ar_invoices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ar_invoices" ADD CONSTRAINT "ar_invoices_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ar_invoices" ADD CONSTRAINT "ar_invoices_revenue_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("revenue_account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ar_invoices" ADD CONSTRAINT "ar_invoices_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ar_invoices" ADD CONSTRAINT "ar_invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ar_invoices" ADD CONSTRAINT "ar_invoices_posted_by_users_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ar_payments" ADD CONSTRAINT "ar_payments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ar_payments" ADD CONSTRAINT "ar_payments_invoice_id_ar_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."ar_invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ar_payments" ADD CONSTRAINT "ar_payments_bank_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ar_payments" ADD CONSTRAINT "ar_payments_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ar_payments" ADD CONSTRAINT "ar_payments_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ar_invoices_company_status_idx" ON "ar_invoices" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "ar_invoices_contract_idx" ON "ar_invoices" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "ar_payments_invoice_idx" ON "ar_payments" USING btree ("invoice_id");