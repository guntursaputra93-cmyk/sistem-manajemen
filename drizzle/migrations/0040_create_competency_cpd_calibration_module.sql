CREATE TYPE "public"."employee_competency_status" AS ENUM('aktif', 'kedaluwarsa', 'proses_perpanjangan');--> statement-breakpoint
CREATE TYPE "public"."cpd_activity_category" AS ENUM('internal', 'eksternal');--> statement-breakpoint
ALTER TYPE "public"."attachment_entity_type" ADD VALUE 'employee_competency';--> statement-breakpoint
ALTER TYPE "public"."attachment_entity_type" ADD VALUE 'cpd_activity';--> statement-breakpoint
CREATE TABLE "competency_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competency_types_company_id_code_unique" UNIQUE("company_id","code")
);
--> statement-breakpoint
CREATE TABLE "employee_competencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"competency_type_id" uuid NOT NULL,
	"certificate_number" text,
	"sector_scheme" text,
	"issued_date" date,
	"expires_at" date,
	"status" "employee_competency_status" DEFAULT 'aktif' NOT NULL,
	"attachment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cpd_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"activity_date" date,
	"activity_name" text NOT NULL,
	"category" "cpd_activity_category" NOT NULL,
	"organizer" text,
	"duration_hours" numeric(5, 2) NOT NULL,
	"attachment_id" uuid,
	"year" integer NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cpd_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"annual_target_hours" numeric(5, 2),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cpd_settings_company_unique" UNIQUE("company_id")
);
--> statement-breakpoint
CREATE TABLE "calibration_meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"meeting_date" date NOT NULL,
	"location_or_media" text,
	"leader_user_id" uuid NOT NULL,
	"notetaker_user_id" uuid,
	"agenda" text,
	"discussion_notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calibration_attendees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"meeting_id" uuid NOT NULL,
	"employee_id" uuid,
	"attendee_name" text,
	"attendee_role" text,
	"signed" boolean DEFAULT false NOT NULL,
	CONSTRAINT "calibration_attendees_employee_or_name" CHECK ("calibration_attendees"."employee_id" IS NOT NULL OR "calibration_attendees"."attendee_name" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "competency_types" ADD CONSTRAINT "competency_types_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_competencies" ADD CONSTRAINT "employee_competencies_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_competencies" ADD CONSTRAINT "employee_competencies_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_competencies" ADD CONSTRAINT "employee_competencies_competency_type_id_competency_types_id_fk" FOREIGN KEY ("competency_type_id") REFERENCES "public"."competency_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_competencies" ADD CONSTRAINT "employee_competencies_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpd_activities" ADD CONSTRAINT "cpd_activities_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpd_activities" ADD CONSTRAINT "cpd_activities_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpd_activities" ADD CONSTRAINT "cpd_activities_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpd_activities" ADD CONSTRAINT "cpd_activities_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpd_settings" ADD CONSTRAINT "cpd_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibration_meetings" ADD CONSTRAINT "calibration_meetings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibration_meetings" ADD CONSTRAINT "calibration_meetings_leader_user_id_users_id_fk" FOREIGN KEY ("leader_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibration_meetings" ADD CONSTRAINT "calibration_meetings_notetaker_user_id_users_id_fk" FOREIGN KEY ("notetaker_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibration_meetings" ADD CONSTRAINT "calibration_meetings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibration_attendees" ADD CONSTRAINT "calibration_attendees_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibration_attendees" ADD CONSTRAINT "calibration_attendees_meeting_id_calibration_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."calibration_meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibration_attendees" ADD CONSTRAINT "calibration_attendees_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;