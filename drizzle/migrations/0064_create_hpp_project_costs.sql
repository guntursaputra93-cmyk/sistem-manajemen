CREATE TABLE "hpp_project_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"cost_date" date NOT NULL,
	"hpp_account_id" uuid NOT NULL,
	"offset_account_id" uuid NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"description" text,
	"journal_entry_id" uuid NOT NULL,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hpp_project_costs_amount_positive" CHECK ("hpp_project_costs"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "hpp_project_costs" ADD CONSTRAINT "hpp_project_costs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hpp_project_costs" ADD CONSTRAINT "hpp_project_costs_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hpp_project_costs" ADD CONSTRAINT "hpp_project_costs_hpp_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("hpp_account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hpp_project_costs" ADD CONSTRAINT "hpp_project_costs_offset_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("offset_account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hpp_project_costs" ADD CONSTRAINT "hpp_project_costs_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hpp_project_costs" ADD CONSTRAINT "hpp_project_costs_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hpp_project_costs_contract_idx" ON "hpp_project_costs" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "hpp_project_costs_company_idx" ON "hpp_project_costs" USING btree ("company_id");