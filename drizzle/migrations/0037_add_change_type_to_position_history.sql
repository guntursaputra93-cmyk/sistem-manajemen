CREATE TYPE "public"."position_history_change_type" AS ENUM('awal', 'promosi', 'demosi', 'mutasi');--> statement-breakpoint
ALTER TABLE "position_history" ADD COLUMN "change_type" "position_history_change_type" DEFAULT 'awal' NOT NULL;--> statement-breakpoint
ALTER TABLE "position_history" ADD COLUMN "notes" text;