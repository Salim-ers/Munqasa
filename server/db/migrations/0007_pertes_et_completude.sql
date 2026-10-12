ALTER TABLE "price_breakdown" ADD COLUMN "decomposition" text DEFAULT 'decomposee' NOT NULL;--> statement-breakpoint
ALTER TABLE "price_breakdown" ADD COLUMN "missing_characteristics" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "price_breakdown_component" ADD COLUMN "loss_mode" text DEFAULT 'appliquee' NOT NULL;--> statement-breakpoint
ALTER TABLE "work_item" ADD COLUMN "missing_data" jsonb DEFAULT '[]'::jsonb NOT NULL;