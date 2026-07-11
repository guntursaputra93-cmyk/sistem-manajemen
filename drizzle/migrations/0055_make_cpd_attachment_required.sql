ALTER TABLE "cpd_activities" DROP CONSTRAINT "cpd_activities_attachment_id_attachments_id_fk";
--> statement-breakpoint
ALTER TABLE "cpd_activities" ALTER COLUMN "attachment_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cpd_activities" ADD CONSTRAINT "cpd_activities_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE restrict ON UPDATE no action;