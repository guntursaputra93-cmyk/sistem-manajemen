CREATE TYPE "public"."kasbon_request_status" AS ENUM('pending', 'disetujui', 'ditolak', 'lunas');--> statement-breakpoint
CREATE TABLE "kasbon_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"total_amount" numeric(15, 2) NOT NULL,
	"installment_amount" numeric(15, 2) NOT NULL,
	"remaining_balance" numeric(15, 2) NOT NULL,
	"purpose" text NOT NULL,
	"request_date" date NOT NULL,
	"status" "kasbon_request_status" DEFAULT 'pending' NOT NULL,
	"approved_by" uuid,
	"decided_at" timestamp with time zone,
	"rejection_reason" text,
	"disbursement_account_id" uuid,
	"journal_entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kasbon_requests_total_positive" CHECK ("kasbon_requests"."total_amount" > 0),
	CONSTRAINT "kasbon_requests_installment_positive" CHECK ("kasbon_requests"."installment_amount" > 0),
	CONSTRAINT "kasbon_requests_remaining_nonneg" CHECK ("kasbon_requests"."remaining_balance" >= 0),
	CONSTRAINT "kasbon_requests_remaining_lte_total" CHECK ("kasbon_requests"."remaining_balance" <= "kasbon_requests"."total_amount")
);
--> statement-breakpoint
ALTER TABLE "kasbon_requests" ADD CONSTRAINT "kasbon_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kasbon_requests" ADD CONSTRAINT "kasbon_requests_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kasbon_requests" ADD CONSTRAINT "kasbon_requests_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kasbon_requests" ADD CONSTRAINT "kasbon_requests_disbursement_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("disbursement_account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kasbon_requests" ADD CONSTRAINT "kasbon_requests_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE restrict ON UPDATE no action;