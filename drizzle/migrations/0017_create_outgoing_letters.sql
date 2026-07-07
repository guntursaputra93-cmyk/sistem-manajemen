CREATE TYPE "public"."outgoing_letter_category" AS ENUM('surat_keluar', 'nota_dinas');--> statement-breakpoint
CREATE TYPE "public"."outgoing_letter_status" AS ENUM('draft', 'menunggu_approval', 'disetujui', 'terkirim', 'ditolak');--> statement-breakpoint
CREATE TABLE "outgoing_letters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	"letter_category" "outgoing_letter_category" NOT NULL,
	"letter_number" text,
	"jenis_key" text NOT NULL,
	"recipient" text,
	"recipient_department_id" uuid,
	"recipient_user_id" uuid,
	"subject" text NOT NULL,
	"status" "outgoing_letter_status" DEFAULT 'draft' NOT NULL,
	"body_content" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finalized_at" timestamp with time zone,
	CONSTRAINT "outgoing_letters_nota_dinas_target_required" CHECK ("outgoing_letters"."letter_category" <> 'nota_dinas' OR ("outgoing_letters"."recipient_department_id" IS NOT NULL OR "outgoing_letters"."recipient_user_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "outgoing_letters" ADD CONSTRAINT "outgoing_letters_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outgoing_letters" ADD CONSTRAINT "outgoing_letters_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outgoing_letters" ADD CONSTRAINT "outgoing_letters_recipient_department_id_departments_id_fk" FOREIGN KEY ("recipient_department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outgoing_letters" ADD CONSTRAINT "outgoing_letters_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outgoing_letters" ADD CONSTRAINT "outgoing_letters_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;