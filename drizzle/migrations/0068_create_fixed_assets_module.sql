CREATE TYPE "public"."fixed_asset_status" AS ENUM('aktif', 'dijual', 'dihapuskan');--> statement-breakpoint
CREATE TABLE "fixed_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"accumulated_depreciation_account_id" uuid NOT NULL,
	"depreciation_expense_account_id" uuid NOT NULL,
	"asset_name" text NOT NULL,
	"acquisition_date" date NOT NULL,
	"acquisition_cost" numeric(15, 2) NOT NULL,
	"useful_life_months" integer NOT NULL,
	"accumulated_depreciation" numeric(15, 2) DEFAULT '0' NOT NULL,
	"status" "fixed_asset_status" DEFAULT 'aktif' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fixed_assets_cost_positive" CHECK ("fixed_assets"."acquisition_cost" > 0),
	CONSTRAINT "fixed_assets_useful_life_positive" CHECK ("fixed_assets"."useful_life_months" > 0),
	CONSTRAINT "fixed_assets_accumulated_nonneg" CHECK ("fixed_assets"."accumulated_depreciation" >= 0),
	CONSTRAINT "fixed_assets_accumulated_lte_cost" CHECK ("fixed_assets"."accumulated_depreciation" <= "fixed_assets"."acquisition_cost")
);
--> statement-breakpoint
CREATE TABLE "depreciation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"period_month" integer NOT NULL,
	"period_year" integer NOT NULL,
	"journal_entry_id" uuid NOT NULL,
	"run_by" uuid,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "depreciation_runs_company_period_unique" UNIQUE("company_id","period_month","period_year"),
	CONSTRAINT "depreciation_runs_month_range" CHECK ("depreciation_runs"."period_month" BETWEEN 1 AND 12),
	CONSTRAINT "depreciation_runs_year_range" CHECK ("depreciation_runs"."period_year" BETWEEN 2000 AND 2100)
);
--> statement-breakpoint
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_accumulated_depreciation_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("accumulated_depreciation_account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_depreciation_expense_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("depreciation_expense_account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "depreciation_runs" ADD CONSTRAINT "depreciation_runs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "depreciation_runs" ADD CONSTRAINT "depreciation_runs_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "depreciation_runs" ADD CONSTRAINT "depreciation_runs_run_by_users_id_fk" FOREIGN KEY ("run_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;