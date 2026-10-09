ALTER TABLE "cctp_document" ADD COLUMN "reference_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "cctp_section" ADD COLUMN "intent" text;