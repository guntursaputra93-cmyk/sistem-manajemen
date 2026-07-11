CREATE TABLE "performance_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"evaluator_employee_id" uuid NOT NULL,
	"evaluation_date" date NOT NULL,
	"scores" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"conclusion_notes" text,
	"evaluator_signed" boolean DEFAULT false NOT NULL,
	"known_by_technical_manager_signed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "performance_evaluations" ADD CONSTRAINT "performance_evaluations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_evaluations" ADD CONSTRAINT "performance_evaluations_assignment_id_service_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."service_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_evaluations" ADD CONSTRAINT "performance_evaluations_evaluator_employee_id_employees_id_fk" FOREIGN KEY ("evaluator_employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;