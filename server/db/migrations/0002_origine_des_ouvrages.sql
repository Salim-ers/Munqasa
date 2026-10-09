ALTER TABLE "work_item" ADD COLUMN "origin" text DEFAULT 'saisie' NOT NULL;--> statement-breakpoint
ALTER TABLE "work_item" ADD COLUMN "job_id" uuid;