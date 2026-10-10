CREATE TYPE "public"."price_batch_status" AS ENUM('en_cours', 'a_publier', 'quarantaine', 'publie', 'sans_changement', 'annule', 'echoue');--> statement-breakpoint
CREATE TYPE "public"."price_row_decision" AS ENUM('a_publier', 'quarantaine', 'publie', 'rejete', 'annule');--> statement-breakpoint
CREATE TYPE "public"."price_scope" AS ENUM('fourniture', 'pose', 'fourniture_pose', 'ouvrage_complet');--> statement-breakpoint
CREATE TYPE "public"."price_value_status" AS ENUM('source', 'calculee', 'estimee');--> statement-breakpoint
CREATE TYPE "public"."reliability" AS ENUM('haute', 'moyenne', 'faible');--> statement-breakpoint
CREATE TYPE "public"."tax_basis" AS ENUM('HT', 'TTC');--> statement-breakpoint
ALTER TYPE "public"."price_kind" ADD VALUE 'ratio';--> statement-breakpoint
ALTER TYPE "public"."price_origin" ADD VALUE 'donnees_publiques';--> statement-breakpoint
CREATE TABLE "price_import_batch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid,
	"label" text NOT NULL,
	"trigger" text NOT NULL,
	"status" "price_batch_status" DEFAULT 'en_cours' NOT NULL,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"message" text,
	"job_id" uuid,
	"published_at" timestamp with time zone,
	"reverted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_import_row" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"external_key" text NOT NULL,
	"action" text NOT NULL,
	"decision" "price_row_decision" NOT NULL,
	"reason" text,
	"payload" jsonb NOT NULL,
	"previous" jsonb,
	"price_item_id" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_source" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"publisher" text NOT NULL,
	"country" "country_code" NOT NULL,
	"homepage" text NOT NULL,
	"license" text NOT NULL,
	"license_url" text,
	"description" text,
	"method" text,
	"coverage" text,
	"resources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"auto_publish" boolean DEFAULT true NOT NULL,
	"max_variation" numeric(9, 4) DEFAULT '30' NOT NULL,
	"refresh_days" integer DEFAULT 30 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_changed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_source_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "price_history" ADD COLUMN "batch_id" uuid;--> statement-breakpoint
ALTER TABLE "price_item" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "price_item" ADD COLUMN "price_scope" "price_scope";--> statement-breakpoint
ALTER TABLE "price_item" ADD COLUMN "tax_basis" "tax_basis";--> statement-breakpoint
ALTER TABLE "price_item" ADD COLUMN "vat_rate" numeric(9, 4);--> statement-breakpoint
ALTER TABLE "price_item" ADD COLUMN "value_status" "price_value_status" DEFAULT 'source' NOT NULL;--> statement-breakpoint
ALTER TABLE "price_item" ADD COLUMN "reliability" "reliability";--> statement-breakpoint
ALTER TABLE "price_item" ADD COLUMN "source_id" uuid;--> statement-breakpoint
ALTER TABLE "price_item" ADD COLUMN "external_key" text;--> statement-breakpoint
ALTER TABLE "price_item" ADD COLUMN "group_key" text;--> statement-breakpoint
ALTER TABLE "price_item" ADD COLUMN "source_url" text;--> statement-breakpoint
ALTER TABLE "price_item" ADD COLUMN "license" text;--> statement-breakpoint
ALTER TABLE "price_item" ADD COLUMN "period" text;--> statement-breakpoint
ALTER TABLE "price_item" ADD COLUMN "price_min" numeric(20, 4);--> statement-breakpoint
ALTER TABLE "price_item" ADD COLUMN "price_max" numeric(20, 4);--> statement-breakpoint
ALTER TABLE "price_item" ADD COLUMN "sample_size" integer;--> statement-breakpoint
ALTER TABLE "price_item" ADD COLUMN "aggregation" text;--> statement-breakpoint
ALTER TABLE "price_item" ADD COLUMN "series" jsonb;--> statement-breakpoint
ALTER TABLE "price_item" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "price_item" ADD COLUMN "import_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "price_import_batch" ADD CONSTRAINT "price_import_batch_source_id_price_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."price_source"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_import_row" ADD CONSTRAINT "price_import_row_batch_id_price_import_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."price_import_batch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_import_row" ADD CONSTRAINT "price_import_row_price_item_id_price_item_id_fk" FOREIGN KEY ("price_item_id") REFERENCES "public"."price_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "price_import_batch_source_idx" ON "price_import_batch" USING btree ("source_id","created_at");--> statement-breakpoint
CREATE INDEX "price_import_row_batch_idx" ON "price_import_row" USING btree ("batch_id","decision");--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_batch_id_price_import_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."price_import_batch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_item" ADD CONSTRAINT "price_item_source_id_price_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."price_source"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_item" ADD CONSTRAINT "price_item_import_batch_id_price_import_batch_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."price_import_batch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "price_item_source_key_idx" ON "price_item" USING btree ("source_id","external_key");--> statement-breakpoint
CREATE INDEX "price_item_group_idx" ON "price_item" USING btree ("group_key");--> statement-breakpoint
CREATE INDEX "price_item_zone_idx" ON "price_item" USING btree ("country","region","city");