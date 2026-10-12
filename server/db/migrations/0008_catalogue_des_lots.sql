CREATE TABLE "lot_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"country" text,
	"project_type" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lot_catalog_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"catalog_id" uuid NOT NULL,
	"parent_id" uuid,
	"number" text NOT NULL,
	"name" text NOT NULL,
	"trade_family" text NOT NULL,
	"favorite" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_lot" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "project_lot" ADD COLUMN "catalog_entry_id" uuid;--> statement-breakpoint
ALTER TABLE "lot_catalog_entry" ADD CONSTRAINT "lot_catalog_entry_catalog_id_lot_catalog_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "public"."lot_catalog"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_catalog_entry" ADD CONSTRAINT "lot_catalog_entry_parent_id_lot_catalog_entry_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."lot_catalog_entry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lot_catalog_entry_number_idx" ON "lot_catalog_entry" USING btree ("catalog_id","number");--> statement-breakpoint
CREATE INDEX "lot_catalog_entry_catalog_idx" ON "lot_catalog_entry" USING btree ("catalog_id","position");--> statement-breakpoint
ALTER TABLE "project_lot" ADD CONSTRAINT "project_lot_parent_id_project_lot_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."project_lot"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_lot" ADD CONSTRAINT "project_lot_catalog_entry_id_lot_catalog_entry_id_fk" FOREIGN KEY ("catalog_entry_id") REFERENCES "public"."lot_catalog_entry"("id") ON DELETE set null ON UPDATE no action;