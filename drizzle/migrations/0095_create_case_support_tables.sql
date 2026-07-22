CREATE TABLE "case_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"milestone_key" text NOT NULL,
	"title" text NOT NULL,
	"stage" "case_stage",
	"status" text DEFAULT 'pending' NOT NULL,
	"due_date" date,
	"completed_at" timestamp with time zone,
	"completed_by" uuid,
	"notes" text,
	"sort_order" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_deliverables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"deliverable_type" text NOT NULL,
	"deliverable_number" text,
	"barcode_value" text,
	"issued_date" date,
	"valid_until" date,
	"status" text DEFAULT 'draft' NOT NULL,
	"file_attachment_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "case_deliverables_deliverable_number_unique" UNIQUE("deliverable_number")
);
--> statement-breakpoint
CREATE TABLE "case_external_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"external_party_name" text NOT NULL,
	"submission_type" text,
	"tracking_number" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"submitted_date" date,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_external_submission_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"status" text NOT NULL,
	"notes" text,
	"reported_by" uuid,
	"reported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "case_milestones" ADD CONSTRAINT "case_milestones_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_milestones" ADD CONSTRAINT "case_milestones_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_milestones" ADD CONSTRAINT "case_milestones_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_deliverables" ADD CONSTRAINT "case_deliverables_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_deliverables" ADD CONSTRAINT "case_deliverables_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_deliverables" ADD CONSTRAINT "case_deliverables_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_deliverables" ADD CONSTRAINT "case_deliverables_file_attachment_id_attachments_id_fk" FOREIGN KEY ("file_attachment_id") REFERENCES "public"."attachments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_deliverables" ADD CONSTRAINT "case_deliverables_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_external_submissions" ADD CONSTRAINT "case_external_submissions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_external_submissions" ADD CONSTRAINT "case_external_submissions_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_external_submissions" ADD CONSTRAINT "case_external_submissions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_external_submission_history" ADD CONSTRAINT "case_external_submission_history_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_external_submission_history" ADD CONSTRAINT "case_external_submission_history_submission_id_case_external_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."case_external_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_external_submission_history" ADD CONSTRAINT "case_external_submission_history_reported_by_users_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "case_milestones_company_id_idx" ON "case_milestones" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "case_milestones_case_id_idx" ON "case_milestones" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "case_deliverables_company_id_idx" ON "case_deliverables" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "case_deliverables_case_id_idx" ON "case_deliverables" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "case_deliverables_organization_id_idx" ON "case_deliverables" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "case_external_submissions_company_id_idx" ON "case_external_submissions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "case_external_submissions_case_id_idx" ON "case_external_submissions" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "case_external_submission_history_company_id_idx" ON "case_external_submission_history" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "case_external_submission_history_submission_id_idx" ON "case_external_submission_history" USING btree ("submission_id");