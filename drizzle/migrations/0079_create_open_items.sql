CREATE TYPE "public"."open_item_status" AS ENUM('terbuka', 'sebagian', 'selesai');--> statement-breakpoint
CREATE TYPE "public"."open_item_type" AS ENUM('uang_muka', 'dp_diterima', 'lainnya');--> statement-breakpoint
CREATE TABLE "open_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"type" "open_item_type" NOT NULL,
	"control_account_id" uuid NOT NULL,
	"description" text NOT NULL,
	"opening_entry_id" uuid NOT NULL,
	"opening_amount" numeric(15, 2) NOT NULL,
	"settled_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"status" "open_item_status" DEFAULT 'terbuka' NOT NULL,
	"due_date" date,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "open_items_opening_positive" CHECK ("open_items"."opening_amount" > 0),
	CONSTRAINT "open_items_settled_nonneg" CHECK ("open_items"."settled_amount" >= 0),
	CONSTRAINT "open_items_settled_lte_opening" CHECK ("open_items"."settled_amount" <= "open_items"."opening_amount")
);
--> statement-breakpoint
CREATE TABLE "open_item_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"open_item_id" uuid NOT NULL,
	"journal_entry_id" uuid NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "open_item_settlements_amount_positive" CHECK ("open_item_settlements"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "open_items" ADD CONSTRAINT "open_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_items" ADD CONSTRAINT "open_items_control_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("control_account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_items" ADD CONSTRAINT "open_items_opening_entry_id_journal_entries_id_fk" FOREIGN KEY ("opening_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_items" ADD CONSTRAINT "open_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_item_settlements" ADD CONSTRAINT "open_item_settlements_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_item_settlements" ADD CONSTRAINT "open_item_settlements_open_item_id_open_items_id_fk" FOREIGN KEY ("open_item_id") REFERENCES "public"."open_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_item_settlements" ADD CONSTRAINT "open_item_settlements_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_item_settlements" ADD CONSTRAINT "open_item_settlements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "open_items_company_status_idx" ON "open_items" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "open_item_settlements_item_idx" ON "open_item_settlements" USING btree ("open_item_id");