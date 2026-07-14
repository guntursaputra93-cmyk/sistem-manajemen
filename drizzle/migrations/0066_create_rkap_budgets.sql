CREATE TABLE "rkap_budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"budgeted_amount" numeric(15, 2) NOT NULL,
	"description" text,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rkap_budgets_company_account_year_unique" UNIQUE("company_id","account_id","year"),
	CONSTRAINT "rkap_budgets_amount_nonneg" CHECK ("rkap_budgets"."budgeted_amount" >= 0),
	CONSTRAINT "rkap_budgets_year_range" CHECK ("rkap_budgets"."year" BETWEEN 2000 AND 2100)
);
--> statement-breakpoint
CREATE TABLE "rkap_budget_monthly" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"budget_id" uuid NOT NULL,
	"month" integer NOT NULL,
	"budgeted_amount" numeric(15, 2) NOT NULL,
	CONSTRAINT "rkap_budget_monthly_budget_month_unique" UNIQUE("budget_id","month"),
	CONSTRAINT "rkap_budget_monthly_month_range" CHECK ("rkap_budget_monthly"."month" BETWEEN 1 AND 12),
	CONSTRAINT "rkap_budget_monthly_amount_nonneg" CHECK ("rkap_budget_monthly"."budgeted_amount" >= 0)
);
--> statement-breakpoint
ALTER TABLE "rkap_budgets" ADD CONSTRAINT "rkap_budgets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rkap_budgets" ADD CONSTRAINT "rkap_budgets_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rkap_budgets" ADD CONSTRAINT "rkap_budgets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rkap_budgets" ADD CONSTRAINT "rkap_budgets_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rkap_budget_monthly" ADD CONSTRAINT "rkap_budget_monthly_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rkap_budget_monthly" ADD CONSTRAINT "rkap_budget_monthly_budget_id_rkap_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."rkap_budgets"("id") ON DELETE cascade ON UPDATE no action;