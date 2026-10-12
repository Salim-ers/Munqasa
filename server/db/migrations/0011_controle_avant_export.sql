CREATE TABLE "export_check" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"job_id" uuid,
	"fingerprint" text NOT NULL,
	"files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quality_issue" ADD COLUMN "audit_point" text;--> statement-breakpoint
ALTER TABLE "export_check" ADD CONSTRAINT "export_check_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "export_check_project_idx" ON "export_check" USING btree ("project_id","created_at");