CREATE TYPE "public"."practitioner_eligibility_final_status" AS ENUM('pending_review', 'layak_senior', 'layak_junior', 'tidak_layak', 'ditolak');--> statement-breakpoint
CREATE TYPE "public"."practitioner_eligibility_status" AS ENUM('layak_senior', 'layak_junior', 'tidak_layak');--> statement-breakpoint
CREATE TABLE "practitioner_eligibility_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"assignment_count" integer NOT NULL,
	"ever_witnessed" boolean NOT NULL,
	"cpd_target_met" boolean NOT NULL,
	"proposed_status" "practitioner_eligibility_status" NOT NULL,
	"final_status" "practitioner_eligibility_final_status" DEFAULT 'pending_review' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "practitioner_eligibility_evaluations_company_employee_year_unique" UNIQUE("company_id","employee_id","year")
);
--> statement-breakpoint
CREATE TABLE "practitioner_eligibility_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"senior_min_assignments" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "practitioner_eligibility_settings_company_unique" UNIQUE("company_id")
);
--> statement-breakpoint
ALTER TABLE "practitioner_eligibility_evaluations" ADD CONSTRAINT "practitioner_eligibility_evaluations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practitioner_eligibility_evaluations" ADD CONSTRAINT "practitioner_eligibility_evaluations_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practitioner_eligibility_evaluations" ADD CONSTRAINT "practitioner_eligibility_evaluations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practitioner_eligibility_settings" ADD CONSTRAINT "practitioner_eligibility_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;