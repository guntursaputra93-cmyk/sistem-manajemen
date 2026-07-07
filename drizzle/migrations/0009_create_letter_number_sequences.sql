CREATE TYPE "public"."sequence_type" AS ENUM('surat_keluar', 'nota_dinas');--> statement-breakpoint
CREATE TABLE "letter_number_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	"sequence_type" "sequence_type" NOT NULL,
	"current_number" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "letter_number_sequences_company_dept_type_unique" UNIQUE("company_id","department_id","sequence_type")
);
--> statement-breakpoint
ALTER TABLE "letter_number_sequences" ADD CONSTRAINT "letter_number_sequences_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter_number_sequences" ADD CONSTRAINT "letter_number_sequences_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;