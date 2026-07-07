CREATE TABLE "proposal_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"outgoing_letter_id" uuid NOT NULL,
	"opportunity_id" uuid,
	"item_name" text NOT NULL,
	"quantity" numeric(10, 2) NOT NULL,
	"unit" text NOT NULL,
	"unit_price" numeric(15, 2) NOT NULL,
	"subtotal" numeric(15, 2) NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "outgoing_letters" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "proposal_items" ADD CONSTRAINT "proposal_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_items" ADD CONSTRAINT "proposal_items_outgoing_letter_id_outgoing_letters_id_fk" FOREIGN KEY ("outgoing_letter_id") REFERENCES "public"."outgoing_letters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_items" ADD CONSTRAINT "proposal_items_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outgoing_letters" ADD CONSTRAINT "outgoing_letters_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;