CREATE TYPE "public"."journal_template_side" AS ENUM('debit', 'kredit');--> statement-breakpoint
CREATE TABLE "journal_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_templates_company_name_unique" UNIQUE("company_id","name")
);
--> statement-breakpoint
CREATE TABLE "journal_template_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"side" "journal_template_side" NOT NULL,
	"line_order" integer NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "journal_templates" ADD CONSTRAINT "journal_templates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_templates" ADD CONSTRAINT "journal_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_template_lines" ADD CONSTRAINT "journal_template_lines_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_template_lines" ADD CONSTRAINT "journal_template_lines_template_id_journal_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."journal_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_template_lines" ADD CONSTRAINT "journal_template_lines_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "journal_templates_company_active_idx" ON "journal_templates" USING btree ("company_id","is_active");--> statement-breakpoint
CREATE INDEX "journal_template_lines_template_idx" ON "journal_template_lines" USING btree ("template_id");