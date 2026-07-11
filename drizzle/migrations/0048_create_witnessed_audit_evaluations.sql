CREATE TABLE "witnessed_audit_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"observer_employee_id" uuid NOT NULL,
	"evaluation_date" date NOT NULL,
	"scores" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"feedback_notes" text,
	"observer_signed" boolean DEFAULT false NOT NULL,
	"auditee_signed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "witnessed_audit_evaluations" ADD CONSTRAINT "witnessed_audit_evaluations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "witnessed_audit_evaluations" ADD CONSTRAINT "witnessed_audit_evaluations_assignment_id_service_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."service_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "witnessed_audit_evaluations" ADD CONSTRAINT "witnessed_audit_evaluations_observer_employee_id_employees_id_fk" FOREIGN KEY ("observer_employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;