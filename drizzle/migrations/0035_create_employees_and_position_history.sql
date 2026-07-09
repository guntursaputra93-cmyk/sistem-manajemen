CREATE TYPE "public"."employee_employment_status" AS ENUM('aktif', 'cuti_panjang', 'resign', 'diberhentikan');--> statement-breakpoint
CREATE TYPE "public"."position_history_status" AS ENUM('active', 'superseded');--> statement-breakpoint
ALTER TYPE "public"."attachment_entity_type" ADD VALUE 'employee';--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid,
	"nik" text NOT NULL,
	"full_name" text NOT NULL,
	"department_id" uuid,
	"current_position_title" text,
	"employment_status" "employee_employment_status" DEFAULT 'aktif' NOT NULL,
	"join_date" date NOT NULL,
	"resign_date" date,
	"phone" text,
	"address" text,
	"emergency_contact_name" text,
	"emergency_contact_phone" text,
	"birth_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "position_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"position_title" text NOT NULL,
	"department_id" uuid,
	"job_level" text,
	"status" "position_history_status" DEFAULT 'active' NOT NULL,
	"effective_date" date NOT NULL,
	"end_date" date,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_history" ADD CONSTRAINT "position_history_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_history" ADD CONSTRAINT "position_history_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_history" ADD CONSTRAINT "position_history_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_history" ADD CONSTRAINT "position_history_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "employees_company_id_nik_unique" ON "employees" USING btree ("company_id","nik");--> statement-breakpoint
CREATE UNIQUE INDEX "employees_user_id_unique" ON "employees" USING btree ("user_id");--> statement-breakpoint
-- Constraint "hanya 1 posisi active per employee_id" — pola persis
-- document_versions_one_active_per_document (lihat 0020_rls_and_indexes_documents.sql).
-- drizzle-kit generate tidak punya API .where() untuk index parsial di versi ini,
-- jadi ditulis tangan di sini.
CREATE UNIQUE INDEX "position_history_one_active_per_employee"
  ON "position_history" ("employee_id")
  WHERE "status" = 'active';