CREATE TYPE "public"."case_stage" AS ENUM('intake', 'penawaran', 'kontrak', 'penugasan', 'pelaksanaan', 'review', 'delivery', 'closed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."case_status" AS ENUM('aktif', 'on_hold', 'selesai', 'batal');--> statement-breakpoint
CREATE TABLE "cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"case_number" text,
	"organization_id" uuid NOT NULL,
	"title" text NOT NULL,
	"service_type" text,
	"current_stage" "case_stage" DEFAULT 'intake' NOT NULL,
	"status" "case_status" DEFAULT 'aktif' NOT NULL,
	"pic_user_id" uuid,
	"opportunity_id" uuid,
	"contract_id" uuid,
	"opened_at" date DEFAULT CURRENT_DATE NOT NULL,
	"target_close_date" date,
	"closed_at" timestamp with time zone,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cases_case_number_unique" UNIQUE("case_number")
);
--> statement-breakpoint
CREATE TABLE "case_stage_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"from_stage" "case_stage",
	"to_stage" "case_stage" NOT NULL,
	"notes" text,
	"changed_by" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_service_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_pic_user_id_users_id_fk" FOREIGN KEY ("pic_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_stage_history" ADD CONSTRAINT "case_stage_history_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_stage_history" ADD CONSTRAINT "case_stage_history_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_stage_history" ADD CONSTRAINT "case_stage_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_service_assignments" ADD CONSTRAINT "case_service_assignments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_service_assignments" ADD CONSTRAINT "case_service_assignments_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_service_assignments" ADD CONSTRAINT "case_service_assignments_assignment_id_service_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."service_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cases_company_id_idx" ON "cases" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "cases_organization_id_idx" ON "cases" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "cases_opportunity_id_idx" ON "cases" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "cases_contract_id_idx" ON "cases" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "cases_pic_user_id_idx" ON "cases" USING btree ("pic_user_id");--> statement-breakpoint
CREATE INDEX "case_stage_history_company_id_idx" ON "case_stage_history" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "case_stage_history_case_id_idx" ON "case_stage_history" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "case_service_assignments_company_id_idx" ON "case_service_assignments" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "case_service_assignments_case_id_idx" ON "case_service_assignments" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "case_service_assignments_assignment_id_idx" ON "case_service_assignments" USING btree ("assignment_id");