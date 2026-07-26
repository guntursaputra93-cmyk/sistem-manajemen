ALTER TABLE "cases" DROP CONSTRAINT "cases_case_number_unique";--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_company_case_number_unique" UNIQUE("company_id","case_number");