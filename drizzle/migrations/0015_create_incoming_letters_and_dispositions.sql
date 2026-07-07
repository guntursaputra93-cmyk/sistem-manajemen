CREATE TYPE "public"."incoming_letter_status" AS ENUM('baru', 'didisposisikan', 'selesai', 'diarsipkan');--> statement-breakpoint
CREATE TABLE "agenda_number_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"current_number" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agenda_number_sequences_company_year_unique" UNIQUE("company_id","year")
);
--> statement-breakpoint
CREATE TABLE "incoming_letters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"agenda_number" text NOT NULL,
	"letter_date" date NOT NULL,
	"received_date" date NOT NULL,
	"sender" text NOT NULL,
	"subject" text NOT NULL,
	"department_id" uuid,
	"status" "incoming_letter_status" DEFAULT 'baru' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "incoming_letters_company_agenda_unique" UNIQUE("company_id","agenda_number")
);
--> statement-breakpoint
CREATE TABLE "letter_dispositions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"incoming_letter_id" uuid NOT NULL,
	"from_user_id" uuid,
	"target_department_id" uuid,
	"target_user_id" uuid,
	"instruction" text,
	"step_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "letter_dispositions_letter_step_unique" UNIQUE("incoming_letter_id","step_order"),
	CONSTRAINT "letter_dispositions_target_required" CHECK ("letter_dispositions"."target_department_id" IS NOT NULL OR "letter_dispositions"."target_user_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "agenda_number_sequences" ADD CONSTRAINT "agenda_number_sequences_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incoming_letters" ADD CONSTRAINT "incoming_letters_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incoming_letters" ADD CONSTRAINT "incoming_letters_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incoming_letters" ADD CONSTRAINT "incoming_letters_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter_dispositions" ADD CONSTRAINT "letter_dispositions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter_dispositions" ADD CONSTRAINT "letter_dispositions_incoming_letter_id_incoming_letters_id_fk" FOREIGN KEY ("incoming_letter_id") REFERENCES "public"."incoming_letters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter_dispositions" ADD CONSTRAINT "letter_dispositions_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter_dispositions" ADD CONSTRAINT "letter_dispositions_target_department_id_departments_id_fk" FOREIGN KEY ("target_department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter_dispositions" ADD CONSTRAINT "letter_dispositions_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;