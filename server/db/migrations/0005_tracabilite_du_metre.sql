CREATE TYPE "public"."measure_confidence" AS ENUM('elevee', 'moyenne', 'faible');--> statement-breakpoint
ALTER TABLE "drawing" ADD COLUMN "revision" text;--> statement-breakpoint
ALTER TABLE "drawing" ADD COLUMN "text_layer" jsonb;--> statement-breakpoint
ALTER TABLE "measurement" ADD COLUMN "confidence" "measure_confidence";--> statement-breakpoint
ALTER TABLE "measurement" ADD COLUMN "input_sources" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "measurement" ADD COLUMN "deductions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "measurement" ADD COLUMN "gross_quantity" numeric(20, 4);