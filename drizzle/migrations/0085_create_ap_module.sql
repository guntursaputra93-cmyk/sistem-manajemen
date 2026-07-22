CREATE TYPE "public"."ap_bill_status" AS ENUM('draft', 'belum_dibayar', 'sebagian', 'lunas', 'jatuh_tempo');--> statement-breakpoint
ALTER TYPE "public"."finance_sequence_type" ADD VALUE 'tagihan';--> statement-breakpoint
CREATE TABLE "ap_bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"bill_number" text,
	"supplier_ref" text,
	"bill_date" date NOT NULL,
	"due_date" date NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"expense_account_id" uuid NOT NULL,
	"description" text,
	"status" "ap_bill_status" DEFAULT 'draft' NOT NULL,
	"journal_entry_id" uuid,
	"created_by" uuid,
	"posted_by" uuid,
	"posted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ap_bills_company_bill_number_unique" UNIQUE("company_id","bill_number"),
	CONSTRAINT "ap_bills_amount_positive" CHECK ("ap_bills"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "ap_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"bill_id" uuid NOT NULL,
	"payment_date" date NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"reference_note" text,
	"journal_entry_id" uuid NOT NULL,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ap_payments_amount_positive" CHECK ("ap_payments"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "ap_bills" ADD CONSTRAINT "ap_bills_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_bills" ADD CONSTRAINT "ap_bills_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_bills" ADD CONSTRAINT "ap_bills_expense_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("expense_account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_bills" ADD CONSTRAINT "ap_bills_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_bills" ADD CONSTRAINT "ap_bills_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_bills" ADD CONSTRAINT "ap_bills_posted_by_users_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_payments" ADD CONSTRAINT "ap_payments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_payments" ADD CONSTRAINT "ap_payments_bill_id_ap_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."ap_bills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_payments" ADD CONSTRAINT "ap_payments_bank_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_payments" ADD CONSTRAINT "ap_payments_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_payments" ADD CONSTRAINT "ap_payments_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ap_bills_company_status_idx" ON "ap_bills" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "ap_bills_organization_idx" ON "ap_bills" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ap_payments_bill_idx" ON "ap_payments" USING btree ("bill_id");