CREATE TYPE "public"."approval_entity_type" AS ENUM('surat_keluar', 'nota_dinas', 'dokumen');--> statement-breakpoint
CREATE TYPE "public"."approval_step_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "approval_flows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"applies_to" "approval_entity_type" NOT NULL,
	"jenis_key" text NOT NULL,
	"step_order" integer NOT NULL,
	"required_role" "user_role",
	"required_approver_user_id" uuid,
	CONSTRAINT "approval_flows_company_applies_jenis_step_unique" UNIQUE("company_id","applies_to","jenis_key","step_order"),
	CONSTRAINT "approval_flows_role_xor_user" CHECK (("approval_flows"."required_role" IS NOT NULL) <> ("approval_flows"."required_approver_user_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "approval_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"entity_type" "approval_entity_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"jenis_key" text NOT NULL,
	"department_id" uuid,
	"step_order" integer NOT NULL,
	"approver_id" uuid,
	"status" "approval_step_status" DEFAULT 'pending' NOT NULL,
	"catatan" text,
	"approved_at" timestamp with time zone,
	CONSTRAINT "approval_steps_entity_step_unique" UNIQUE("entity_type","entity_id","step_order")
);
--> statement-breakpoint
ALTER TABLE "approval_flows" ADD CONSTRAINT "approval_flows_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_flows" ADD CONSTRAINT "approval_flows_required_approver_user_id_users_id_fk" FOREIGN KEY ("required_approver_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_approver_id_users_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;