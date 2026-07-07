ALTER TABLE "companies" ADD COLUMN "code" text;--> statement-breakpoint
ALTER TABLE "departments" ADD COLUMN "code" text;--> statement-breakpoint
CREATE UNIQUE INDEX "departments_company_id_code_unique" ON "departments" USING btree ("company_id","code");--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_code_unique" UNIQUE("code");