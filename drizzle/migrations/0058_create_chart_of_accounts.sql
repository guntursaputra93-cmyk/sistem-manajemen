CREATE TYPE "public"."account_type" AS ENUM('aset', 'kewajiban', 'modal', 'pendapatan', 'hpp', 'biaya');--> statement-breakpoint
CREATE TYPE "public"."normal_balance" AS ENUM('debit', 'kredit');--> statement-breakpoint
CREATE TABLE "chart_of_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"level" integer NOT NULL,
	"parent_id" uuid,
	"account_type" "account_type" NOT NULL,
	"normal_balance" "normal_balance" NOT NULL,
	"is_header" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chart_of_accounts_company_code_unique" UNIQUE("company_id","code"),
	CONSTRAINT "chart_of_accounts_level_range" CHECK ("chart_of_accounts"."level" BETWEEN 1 AND 3),
	CONSTRAINT "chart_of_accounts_level1_2_is_header" CHECK ("chart_of_accounts"."level" = 3 OR "chart_of_accounts"."is_header" = true),
	CONSTRAINT "chart_of_accounts_root_has_no_parent" CHECK ("chart_of_accounts"."level" > 1 OR "chart_of_accounts"."parent_id" IS NULL),
	CONSTRAINT "chart_of_accounts_non_root_has_parent" CHECK ("chart_of_accounts"."level" = 1 OR "chart_of_accounts"."parent_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_parent_id_chart_of_accounts_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chart_of_accounts_company_parent_idx" ON "chart_of_accounts" USING btree ("company_id","parent_id");