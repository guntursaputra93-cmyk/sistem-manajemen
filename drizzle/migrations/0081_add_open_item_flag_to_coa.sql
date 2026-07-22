ALTER TABLE "chart_of_accounts" ADD COLUMN "is_open_item" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "chart_of_accounts" ADD COLUMN "open_item_type" text;