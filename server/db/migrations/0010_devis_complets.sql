ALTER TYPE "public"."quote_event_kind" ADD VALUE 'nouvelle_version';--> statement-breakpoint
ALTER TYPE "public"."quote_event_kind" ADD VALUE 'archivage';--> statement-breakpoint
ALTER TYPE "public"."quote_event_kind" ADD VALUE 'restauration';--> statement-breakpoint
ALTER TYPE "public"."quote_event_kind" ADD VALUE 'export';--> statement-breakpoint
ALTER TYPE "public"."quote_event_kind" ADD VALUE 'generation';--> statement-breakpoint
CREATE TABLE "quote_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"label" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "source" text DEFAULT 'vierge' NOT NULL;--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "dpgf_id" uuid;--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "lot_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "client_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "site_name" text;--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "tax_regime" text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "tax_exemption_basis" text;--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "deposit_rate" numeric(9, 4);--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "deposit_amount" numeric(20, 4);--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "site_costs_rate" numeric(9, 4);--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "overhead_rate" numeric(9, 4);--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "overhead_base" text DEFAULT 'debourse_total' NOT NULL;--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "contingency_rate" numeric(9, 4);--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "contingency_base" text DEFAULT 'debourse_total' NOT NULL;--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "margin_rate" numeric(9, 4);--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "margin_mode" text DEFAULT 'taux_de_marge' NOT NULL;--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "total_ht" numeric(20, 4);--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "total_vat" numeric(20, 4);--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "total_ttc" numeric(20, 4);--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "totals_state" text DEFAULT 'non_renseigne' NOT NULL;--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "generation_job_id" uuid;--> statement-breakpoint
ALTER TABLE "quote_line" ADD COLUMN "lot_id" uuid;--> statement-breakpoint
ALTER TABLE "quote_line" ADD COLUMN "lot_label" text;--> statement-breakpoint
ALTER TABLE "quote_line" ADD COLUMN "work_item_id" uuid;--> statement-breakpoint
ALTER TABLE "quote_line" ADD COLUMN "price_item_id" uuid;--> statement-breakpoint
ALTER TABLE "quote_line" ADD COLUMN "price_origin" text;--> statement-breakpoint
ALTER TABLE "quote_line" ADD COLUMN "price_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "quote_line" ADD COLUMN "price_confirmed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_line" ADD COLUMN "pricing_mode" text DEFAULT 'direct' NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_line" ADD COLUMN "supply_cost" numeric(20, 4);--> statement-breakpoint
ALTER TABLE "quote_line" ADD COLUMN "labor_cost" numeric(20, 4);--> statement-breakpoint
ALTER TABLE "quote_line" ADD COLUMN "quantity_source" text;--> statement-breakpoint
ALTER TABLE "quote_line" ADD COLUMN "amount_ht" numeric(20, 4);--> statement-breakpoint
ALTER TABLE "quote_version" ADD CONSTRAINT "quote_version_quote_id_quote_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quote"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quote_version_quote_idx" ON "quote_version" USING btree ("quote_id","version");--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_dpgf_id_dpgf_id_fk" FOREIGN KEY ("dpgf_id") REFERENCES "public"."dpgf"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_line" ADD CONSTRAINT "quote_line_lot_id_project_lot_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."project_lot"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_line" ADD CONSTRAINT "quote_line_work_item_id_work_item_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_line" ADD CONSTRAINT "quote_line_price_item_id_price_item_id_fk" FOREIGN KEY ("price_item_id") REFERENCES "public"."price_item"("id") ON DELETE set null ON UPDATE no action;