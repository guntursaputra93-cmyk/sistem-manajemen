CREATE TYPE "public"."document_access_scope" AS ENUM('semua_staf', 'departemen_tertentu', 'role_tertentu');--> statement-breakpoint
CREATE TYPE "public"."document_access_action" AS ENUM('view', 'download');--> statement-breakpoint
CREATE TABLE "document_access_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"document_category_id" uuid,
	"document_id" uuid,
	"scope" "document_access_scope" NOT NULL,
	"department_id" uuid,
	"role" "user_role",
	CONSTRAINT "document_access_rules_target_xor" CHECK (("document_access_rules"."document_category_id" IS NOT NULL) <> ("document_access_rules"."document_id" IS NOT NULL)),
	CONSTRAINT "document_access_rules_scope_fields_consistent" CHECK ((
      ("document_access_rules"."scope" = 'semua_staf' AND "document_access_rules"."department_id" IS NULL AND "document_access_rules"."role" IS NULL)
      OR ("document_access_rules"."scope" = 'departemen_tertentu' AND "document_access_rules"."department_id" IS NOT NULL AND "document_access_rules"."role" IS NULL)
      OR ("document_access_rules"."scope" = 'role_tertentu' AND "document_access_rules"."role" IS NOT NULL AND "document_access_rules"."department_id" IS NULL)
    ))
);
--> statement-breakpoint
CREATE TABLE "document_access_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"document_version_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"action" "document_access_action" NOT NULL,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_access_rules" ADD CONSTRAINT "document_access_rules_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_access_rules" ADD CONSTRAINT "document_access_rules_document_category_id_document_categories_id_fk" FOREIGN KEY ("document_category_id") REFERENCES "public"."document_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_access_rules" ADD CONSTRAINT "document_access_rules_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_access_rules" ADD CONSTRAINT "document_access_rules_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_access_logs" ADD CONSTRAINT "document_access_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_access_logs" ADD CONSTRAINT "document_access_logs_document_version_id_document_versions_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."document_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_access_logs" ADD CONSTRAINT "document_access_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_access_logs_user_version_idx" ON "document_access_logs" USING btree ("user_id","document_version_id");