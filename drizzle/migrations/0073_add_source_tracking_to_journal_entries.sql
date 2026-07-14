ALTER TABLE "journal_entries" ADD COLUMN "source_type" text;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "source_id" uuid;--> statement-breakpoint
CREATE INDEX "journal_entries_source_idx" ON "journal_entries" USING btree ("source_type","source_id");