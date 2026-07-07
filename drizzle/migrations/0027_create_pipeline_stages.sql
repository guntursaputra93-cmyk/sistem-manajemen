CREATE TABLE "pipeline_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"stage_key" text NOT NULL,
	"stage_order" integer NOT NULL,
	"is_won_stage" boolean DEFAULT false NOT NULL,
	"is_lost_stage" boolean DEFAULT false NOT NULL,
	CONSTRAINT "pipeline_stages_company_key_unique" UNIQUE("company_id","stage_key"),
	CONSTRAINT "pipeline_stages_not_both_won_and_lost" CHECK (NOT ("pipeline_stages"."is_won_stage" AND "pipeline_stages"."is_lost_stage"))
);
--> statement-breakpoint
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;