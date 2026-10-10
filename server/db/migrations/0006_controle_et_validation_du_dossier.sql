ALTER TYPE "public"."document_type" ADD VALUE 'metre';--> statement-breakpoint
ALTER TYPE "public"."document_type" ADD VALUE 'dossier';--> statement-breakpoint
ALTER TYPE "public"."job_kind" ADD VALUE 'generation_dossier';--> statement-breakpoint
CREATE TABLE "dossier_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"job_id" uuid,
	"summary" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dossier_validation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"signed_by" text NOT NULL,
	"qualification" text NOT NULL,
	"statement" text NOT NULL,
	"documents" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dossier_audit" ADD CONSTRAINT "dossier_audit_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossier_validation" ADD CONSTRAINT "dossier_validation_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dossier_audit_project_idx" ON "dossier_audit" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "dossier_validation_project_idx" ON "dossier_validation" USING btree ("project_id","created_at");