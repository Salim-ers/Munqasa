CREATE TYPE "public"."component_category" AS ENUM('materiau', 'main_oeuvre', 'materiel', 'sous_traitance', 'transport', 'frais_chantier');--> statement-breakpoint
CREATE TYPE "public"."country_code" AS ENUM('MA', 'FR');--> statement-breakpoint
CREATE TYPE "public"."currency_code" AS ENUM('MAD', 'EUR');--> statement-breakpoint
CREATE TYPE "public"."design_phase" AS ENUM('esquisse', 'aps', 'apd', 'pro', 'dce', 'exe', 'autre');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('brouillon', 'en_generation', 'a_valider', 'valide', 'archive');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('cctp', 'dpgf', 'sous_detail', 'devis');--> statement-breakpoint
CREATE TYPE "public"."dpgf_line_kind" AS ENUM('chapitre', 'sous_chapitre', 'poste');--> statement-breakpoint
CREATE TYPE "public"."drawing_kind" AS ENUM('plan_masse', 'plan_niveau', 'coupe', 'facade', 'detail', 'reseaux', 'autre');--> statement-breakpoint
CREATE TYPE "public"."file_kind" AS ENUM('plan', 'document_consultation', 'document_technique', 'bordereau_prix', 'devis_fournisseur', 'facture', 'catalogue', 'autre');--> statement-breakpoint
CREATE TYPE "public"."file_status" AS ENUM('en_attente', 'televerse', 'verifie', 'en_traitement', 'traite', 'echec', 'rejete');--> statement-breakpoint
CREATE TYPE "public"."issue_category" AS ENUM('completude', 'reference', 'source_manquante', 'incoherence', 'doublon', 'unite', 'calcul', 'tracabilite', 'version', 'reserve');--> statement-breakpoint
CREATE TYPE "public"."issue_severity" AS ENUM('bloquante', 'majeure', 'mineure', 'information');--> statement-breakpoint
CREATE TYPE "public"."issue_status" AS ENUM('ouverte', 'resolue', 'ignoree');--> statement-breakpoint
CREATE TYPE "public"."job_kind" AS ENUM('analyse_plans', 'generation_cctp', 'generation_dpgf', 'sous_detail', 'generation_devis', 'controle_qualite', 'export', 'import_prix');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('en_attente', 'en_cours', 'termine', 'echoue', 'annule');--> statement-breakpoint
CREATE TYPE "public"."line_status" AS ENUM('non_chiffre', 'a_verifier', 'valide');--> statement-breakpoint
CREATE TYPE "public"."margin_mode" AS ENUM('taux_de_marge', 'taux_de_marque', 'coefficient');--> statement-breakpoint
CREATE TYPE "public"."market_type" AS ENUM('appel_offres_ouvert', 'appel_offres_restreint', 'concours', 'procedure_negociee', 'consultation_privee', 'gre_a_gre', 'autre');--> statement-breakpoint
CREATE TYPE "public"."measure_method" AS ENUM('longueur', 'surface', 'volume', 'unite', 'poids', 'surface_developpee', 'formule');--> statement-breakpoint
CREATE TYPE "public"."measure_source" AS ENUM('cote_plan', 'dxf', 'ifc', 'saisie', 'proposition_ia');--> statement-breakpoint
CREATE TYPE "public"."notification_kind" AS ENUM('echeance', 'traitement', 'qualite', 'prix', 'securite', 'systeme');--> statement-breakpoint
CREATE TYPE "public"."price_kind" AS ENUM('ouvrage', 'materiau', 'main_oeuvre', 'materiel', 'sous_traitance', 'transport');--> statement-breakpoint
CREATE TYPE "public"."price_origin" AS ENUM('dpgf_historique', 'devis_fournisseur', 'facture_fournisseur', 'catalogue', 'bordereau_historique', 'tableau_personnel', 'base_sous_licence', 'saisie_manuelle');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('brouillon', 'analyse', 'etude_technique', 'chiffrage', 'controle_qualite', 'pret_a_remettre', 'archive');--> statement-breakpoint
CREATE TYPE "public"."prospect_status" AS ENUM('nouveau', 'qualifie', 'converti', 'perdu');--> statement-breakpoint
CREATE TYPE "public"."quote_event_kind" AS ENUM('creation', 'modification', 'validation', 'envoi', 'relance', 'acceptation', 'refus', 'expiration', 'duplication');--> statement-breakpoint
CREATE TYPE "public"."quote_line_kind" AS ENUM('section', 'ligne', 'option');--> statement-breakpoint
CREATE TYPE "public"."quote_status" AS ENUM('brouillon', 'a_verifier', 'valide', 'envoye', 'accepte', 'refuse', 'expire');--> statement-breakpoint
CREATE TYPE "public"."rate_base" AS ENUM('debourse_sec', 'debourse_total', 'prix_de_revient');--> statement-breakpoint
CREATE TYPE "public"."rate_kind" AS ENUM('reference', 'achat', 'vente', 'contractuel');--> statement-breakpoint
CREATE TYPE "public"."reference_kind" AS ENUM('loi', 'decret', 'arrete', 'ccag', 'cctg', 'norme', 'dtu', 'eurocode', 'reglement', 'regle_professionnelle', 'autre');--> statement-breakpoint
CREATE TYPE "public"."reference_scope" AS ENUM('MA', 'FR', 'INT');--> statement-breakpoint
CREATE TYPE "public"."section_status" AS ENUM('a_rediger', 'genere', 'a_valider', 'valide');--> statement-breakpoint
CREATE TYPE "public"."sector" AS ENUM('public', 'prive');--> statement-breakpoint
CREATE TYPE "public"."step_status" AS ENUM('en_attente', 'en_cours', 'termine', 'echoue', 'ignore');--> statement-breakpoint
CREATE TYPE "public"."validation_status" AS ENUM('a_verifier', 'verifie', 'rejete');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passkey" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"public_key" text NOT NULL,
	"user_id" text NOT NULL,
	"credential_id" text NOT NULL,
	"counter" integer NOT NULL,
	"device_type" text NOT NULL,
	"backed_up" boolean NOT NULL,
	"transports" text,
	"created_at" timestamp with time zone,
	"aaguid" text
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "two_factor" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" text NOT NULL,
	"verified" boolean DEFAULT true,
	"failed_verification_count" integer DEFAULT 0,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"two_factor_enabled" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_setting" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"legal_name" text NOT NULL,
	"trade_name" text,
	"legal_form" text,
	"country" "country_code" NOT NULL,
	"address" text,
	"city" text,
	"postal_code" text,
	"email" text,
	"phone" text,
	"website" text,
	"legal_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"default_currency" "currency_code" NOT NULL,
	"default_vat_rate" numeric(9, 4),
	"quote_legal_mentions" text,
	"payment_terms" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sector" "sector" NOT NULL,
	"legal_form" text,
	"country" "country_code" NOT NULL,
	"city" text,
	"address" text,
	"contact_name" text,
	"email" text,
	"phone" text,
	"legal_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospect" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"company" text,
	"country" "country_code" NOT NULL,
	"city" text,
	"email" text,
	"phone" text,
	"source" text,
	"status" "prospect_status" DEFAULT 'nouveau' NOT NULL,
	"notes" text,
	"converted_client_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deadline" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"title" text NOT NULL,
	"kind" text DEFAULT 'jalon' NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"done_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"name" text NOT NULL,
	"client_id" uuid,
	"country" "country_code" NOT NULL,
	"city" text,
	"site_address" text,
	"market_type" "market_type" NOT NULL,
	"sector" "sector" NOT NULL,
	"works_nature" text,
	"design_phase" "design_phase" DEFAULT 'dce' NOT NULL,
	"currency" "currency_code" NOT NULL,
	"status" "project_status" DEFAULT 'brouillon' NOT NULL,
	"submission_deadline" timestamp with time zone,
	"start_date" date,
	"description" text,
	"hypotheses" text,
	"constraints" text,
	"reference_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"manual_estimate" numeric(20, 2),
	"archived_at" timestamp with time zone,
	"last_opened_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "project_lot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"trade_family" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reference_counter" (
	"scope" text PRIMARY KEY NOT NULL,
	"value" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drawing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"source_file_id" uuid NOT NULL,
	"page_number" integer DEFAULT 1 NOT NULL,
	"sheet_number" text,
	"title" text,
	"kind" "drawing_kind" DEFAULT 'autre' NOT NULL,
	"level" text,
	"scale_text" text,
	"scale_ratio" numeric(12, 4),
	"calibration" jsonb,
	"extraction" jsonb,
	"status" "validation_status" DEFAULT 'a_verifier' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drawing_annotation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drawing_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"label" text,
	"geometry" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_file" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"kind" "file_kind" NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" text,
	"storage_key" text NOT NULL,
	"status" "file_status" DEFAULT 'en_attente' NOT NULL,
	"page_count" integer,
	"extracted_text" text,
	"error" text,
	"uploaded_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_file_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "material" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"family" text,
	"supplier_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"price_item_id" uuid NOT NULL,
	"unit_price" numeric(20, 4) NOT NULL,
	"currency" "currency_code" NOT NULL,
	"price_date" date NOT NULL,
	"origin" "price_origin" NOT NULL,
	"source_file_id" uuid,
	"note" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text,
	"designation" text NOT NULL,
	"kind" "price_kind" NOT NULL,
	"unit" text NOT NULL,
	"unit_price" numeric(20, 4) NOT NULL,
	"currency" "currency_code" NOT NULL,
	"country" "country_code" NOT NULL,
	"region" text,
	"city" text,
	"trade_family" text,
	"sub_family" text,
	"origin" "price_origin" NOT NULL,
	"supplier_id" uuid,
	"source_file_id" uuid,
	"source_ref" text,
	"price_date" date NOT NULL,
	"verification_status" "validation_status" DEFAULT 'a_verifier' NOT NULL,
	"commercial_conditions" text,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"country" "country_code" NOT NULL,
	"city" text,
	"contact_name" text,
	"email" text,
	"phone" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "technical_reference" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" "reference_scope" NOT NULL,
	"kind" "reference_kind" NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"version" text,
	"published_on" date,
	"domain" text,
	"source_url" text,
	"verification_status" "validation_status" DEFAULT 'a_verifier' NOT NULL,
	"verified_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cctp_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"lot_id" uuid,
	"title" text NOT NULL,
	"country" "country_code" NOT NULL,
	"phase" "design_phase" NOT NULL,
	"detail_level" text DEFAULT 'standard' NOT NULL,
	"status" "document_status" DEFAULT 'brouillon' NOT NULL,
	"current_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cctp_section" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"parent_id" uuid,
	"position" integer NOT NULL,
	"number" text NOT NULL,
	"title" text NOT NULL,
	"kind" text DEFAULT 'article' NOT NULL,
	"content" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reference_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"work_item_id" uuid,
	"status" "section_status" DEFAULT 'a_rediger' NOT NULL,
	"validated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"document_type" "document_type" NOT NULL,
	"document_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"note" text,
	"validated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dpgf" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"lot_id" uuid,
	"cctp_document_id" uuid,
	"title" text NOT NULL,
	"currency" "currency_code" NOT NULL,
	"vat_rate" numeric(9, 4),
	"status" "document_status" DEFAULT 'brouillon' NOT NULL,
	"current_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dpgf_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dpgf_id" uuid NOT NULL,
	"parent_id" uuid,
	"position" integer NOT NULL,
	"kind" "dpgf_line_kind" NOT NULL,
	"code" text,
	"lot_number" text,
	"cctp_ref" text,
	"cctp_section_id" uuid,
	"work_item_id" uuid,
	"designation" text NOT NULL,
	"description" text,
	"unit" text,
	"quantity" numeric(20, 4),
	"unit_price" numeric(20, 4),
	"amount" numeric(20, 2),
	"measurement_id" uuid,
	"quantity_source" text,
	"price_item_id" uuid,
	"price_source" text,
	"status" "line_status" DEFAULT 'non_chiffre' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "measurement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"lot_id" uuid,
	"work_item_id" uuid,
	"drawing_id" uuid,
	"zone_ref" text,
	"label" text NOT NULL,
	"method" "measure_method" NOT NULL,
	"formula" text,
	"inputs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"quantity" numeric(20, 4),
	"unit" text NOT NULL,
	"source" "measure_source" NOT NULL,
	"status" "validation_status" DEFAULT 'a_verifier' NOT NULL,
	"validated_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_breakdown" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"dpgf_line_id" uuid,
	"work_item_id" uuid,
	"designation" text NOT NULL,
	"unit" text NOT NULL,
	"currency" "currency_code" NOT NULL,
	"overhead_rate" numeric(9, 4),
	"overhead_base" "rate_base" DEFAULT 'debourse_total' NOT NULL,
	"contingency_rate" numeric(9, 4),
	"contingency_base" "rate_base" DEFAULT 'debourse_total' NOT NULL,
	"margin_rate" numeric(9, 4),
	"margin_mode" "margin_mode" DEFAULT 'taux_de_marge' NOT NULL,
	"computed_unit_price" numeric(20, 4),
	"locked" boolean DEFAULT false NOT NULL,
	"status" "document_status" DEFAULT 'brouillon' NOT NULL,
	"current_version" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_breakdown_component" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"breakdown_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"category" "component_category" NOT NULL,
	"designation" text NOT NULL,
	"unit" text NOT NULL,
	"quantity" numeric(20, 6) NOT NULL,
	"unit_cost" numeric(20, 4),
	"loss_rate" numeric(9, 4),
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_hypothesis" boolean DEFAULT true NOT NULL,
	"price_item_id" uuid,
	"supplier_id" uuid,
	"source_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"lot_id" uuid,
	"code" text,
	"designation" text NOT NULL,
	"description" text,
	"unit" text,
	"location" text,
	"attributes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "currency_rate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"base_currency" "currency_code" NOT NULL,
	"quote_currency" "currency_code" NOT NULL,
	"rate" numeric(20, 10) NOT NULL,
	"kind" "rate_kind" NOT NULL,
	"source" text NOT NULL,
	"source_ref" text,
	"observed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"project_id" uuid,
	"client_id" uuid,
	"company_profile_id" uuid,
	"issuer_snapshot" jsonb,
	"title" text NOT NULL,
	"site_address" text,
	"issue_date" date,
	"validity_days" integer,
	"currency" "currency_code" NOT NULL,
	"discount_rate" numeric(9, 4),
	"vat_rate" numeric(9, 4),
	"status" "quote_status" DEFAULT 'brouillon' NOT NULL,
	"payment_terms" text,
	"notes" text,
	"legal_mentions" text,
	"current_version" integer DEFAULT 0 NOT NULL,
	"locked_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quote_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "quote_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"kind" "quote_event_kind" NOT NULL,
	"note" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"parent_id" uuid,
	"position" integer NOT NULL,
	"kind" "quote_line_kind" NOT NULL,
	"designation" text NOT NULL,
	"description" text,
	"unit" text,
	"quantity" numeric(20, 4),
	"unit_price" numeric(20, 4),
	"discount_rate" numeric(9, 4),
	"vat_rate" numeric(9, 4),
	"dpgf_line_id" uuid,
	"price_breakdown_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid,
	"project_id" uuid,
	"agent" text NOT NULL,
	"model" text NOT NULL,
	"input_summary" text,
	"output" jsonb,
	"tool_calls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'en_cours' NOT NULL,
	"error" text,
	"response_id" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ai_usage_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_run_id" uuid,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"cached_input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(14, 6),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generation_artifact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid,
	"project_id" uuid,
	"document_version_id" uuid,
	"kind" text NOT NULL,
	"file_name" text NOT NULL,
	"storage_key" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"variant" text DEFAULT 'propre' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "generation_artifact_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "generation_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"kind" "job_kind" NOT NULL,
	"status" "job_status" DEFAULT 'en_attente' NOT NULL,
	"idempotency_key" text NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"locked_until" timestamp with time zone,
	"locked_by" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"cancel_requested_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "generation_job_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "generation_step" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"status" "step_status" DEFAULT 'en_attente' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"result" jsonb,
	"log" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" text,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"ip_address" text,
	"user_agent" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"project_id" uuid,
	"link" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quality_issue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"document_type" "document_type",
	"document_id" uuid,
	"severity" "issue_severity" NOT NULL,
	"category" "issue_category" NOT NULL,
	"message" text NOT NULL,
	"targets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "issue_status" DEFAULT 'ouverte' NOT NULL,
	"resolution_note" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passkey" ADD CONSTRAINT "passkey_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect" ADD CONSTRAINT "prospect_converted_client_id_client_id_fk" FOREIGN KEY ("converted_client_id") REFERENCES "public"."client"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadline" ADD CONSTRAINT "deadline_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_lot" ADD CONSTRAINT "project_lot_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing" ADD CONSTRAINT "drawing_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing" ADD CONSTRAINT "drawing_source_file_id_source_file_id_fk" FOREIGN KEY ("source_file_id") REFERENCES "public"."source_file"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_annotation" ADD CONSTRAINT "drawing_annotation_drawing_id_drawing_id_fk" FOREIGN KEY ("drawing_id") REFERENCES "public"."drawing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_file" ADD CONSTRAINT "source_file_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material" ADD CONSTRAINT "material_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_price_item_id_price_item_id_fk" FOREIGN KEY ("price_item_id") REFERENCES "public"."price_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_source_file_id_source_file_id_fk" FOREIGN KEY ("source_file_id") REFERENCES "public"."source_file"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_item" ADD CONSTRAINT "price_item_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_item" ADD CONSTRAINT "price_item_source_file_id_source_file_id_fk" FOREIGN KEY ("source_file_id") REFERENCES "public"."source_file"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cctp_document" ADD CONSTRAINT "cctp_document_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cctp_document" ADD CONSTRAINT "cctp_document_lot_id_project_lot_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."project_lot"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cctp_section" ADD CONSTRAINT "cctp_section_document_id_cctp_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."cctp_document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cctp_section" ADD CONSTRAINT "cctp_section_parent_id_cctp_section_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."cctp_section"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cctp_section" ADD CONSTRAINT "cctp_section_work_item_id_work_item_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_version" ADD CONSTRAINT "document_version_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dpgf" ADD CONSTRAINT "dpgf_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dpgf" ADD CONSTRAINT "dpgf_lot_id_project_lot_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."project_lot"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dpgf" ADD CONSTRAINT "dpgf_cctp_document_id_cctp_document_id_fk" FOREIGN KEY ("cctp_document_id") REFERENCES "public"."cctp_document"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dpgf_line" ADD CONSTRAINT "dpgf_line_dpgf_id_dpgf_id_fk" FOREIGN KEY ("dpgf_id") REFERENCES "public"."dpgf"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dpgf_line" ADD CONSTRAINT "dpgf_line_parent_id_dpgf_line_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."dpgf_line"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dpgf_line" ADD CONSTRAINT "dpgf_line_cctp_section_id_cctp_section_id_fk" FOREIGN KEY ("cctp_section_id") REFERENCES "public"."cctp_section"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dpgf_line" ADD CONSTRAINT "dpgf_line_work_item_id_work_item_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dpgf_line" ADD CONSTRAINT "dpgf_line_measurement_id_measurement_id_fk" FOREIGN KEY ("measurement_id") REFERENCES "public"."measurement"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dpgf_line" ADD CONSTRAINT "dpgf_line_price_item_id_price_item_id_fk" FOREIGN KEY ("price_item_id") REFERENCES "public"."price_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement" ADD CONSTRAINT "measurement_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement" ADD CONSTRAINT "measurement_lot_id_project_lot_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."project_lot"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement" ADD CONSTRAINT "measurement_work_item_id_work_item_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement" ADD CONSTRAINT "measurement_drawing_id_drawing_id_fk" FOREIGN KEY ("drawing_id") REFERENCES "public"."drawing"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_breakdown" ADD CONSTRAINT "price_breakdown_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_breakdown" ADD CONSTRAINT "price_breakdown_dpgf_line_id_dpgf_line_id_fk" FOREIGN KEY ("dpgf_line_id") REFERENCES "public"."dpgf_line"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_breakdown" ADD CONSTRAINT "price_breakdown_work_item_id_work_item_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_breakdown_component" ADD CONSTRAINT "price_breakdown_component_breakdown_id_price_breakdown_id_fk" FOREIGN KEY ("breakdown_id") REFERENCES "public"."price_breakdown"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_breakdown_component" ADD CONSTRAINT "price_breakdown_component_price_item_id_price_item_id_fk" FOREIGN KEY ("price_item_id") REFERENCES "public"."price_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_breakdown_component" ADD CONSTRAINT "price_breakdown_component_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item" ADD CONSTRAINT "work_item_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item" ADD CONSTRAINT "work_item_lot_id_project_lot_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."project_lot"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_company_profile_id_company_profile_id_fk" FOREIGN KEY ("company_profile_id") REFERENCES "public"."company_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_event" ADD CONSTRAINT "quote_event_quote_id_quote_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quote"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_line" ADD CONSTRAINT "quote_line_quote_id_quote_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quote"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_line" ADD CONSTRAINT "quote_line_parent_id_quote_line_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."quote_line"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_line" ADD CONSTRAINT "quote_line_dpgf_line_id_dpgf_line_id_fk" FOREIGN KEY ("dpgf_line_id") REFERENCES "public"."dpgf_line"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_line" ADD CONSTRAINT "quote_line_price_breakdown_id_price_breakdown_id_fk" FOREIGN KEY ("price_breakdown_id") REFERENCES "public"."price_breakdown"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_job_id_generation_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."generation_job"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_record" ADD CONSTRAINT "ai_usage_record_agent_run_id_agent_run_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_artifact" ADD CONSTRAINT "generation_artifact_job_id_generation_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."generation_job"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_artifact" ADD CONSTRAINT "generation_artifact_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_artifact" ADD CONSTRAINT "generation_artifact_document_version_id_document_version_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."document_version"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_job" ADD CONSTRAINT "generation_job_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_step" ADD CONSTRAINT "generation_step_job_id_generation_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."generation_job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_issue" ADD CONSTRAINT "quality_issue_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "passkey_user_id_idx" ON "passkey" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "passkey_credential_id_idx" ON "passkey" USING btree ("credential_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "two_factor_secret_idx" ON "two_factor" USING btree ("secret");--> statement-breakpoint
CREATE INDEX "two_factor_user_id_idx" ON "two_factor" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "company_profile_country_idx" ON "company_profile" USING btree ("country");--> statement-breakpoint
CREATE INDEX "client_name_idx" ON "client" USING btree ("name");--> statement-breakpoint
CREATE INDEX "client_country_idx" ON "client" USING btree ("country");--> statement-breakpoint
CREATE INDEX "prospect_status_idx" ON "prospect" USING btree ("status");--> statement-breakpoint
CREATE INDEX "deadline_due_idx" ON "deadline" USING btree ("due_at");--> statement-breakpoint
CREATE INDEX "deadline_project_idx" ON "deadline" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_status_idx" ON "project" USING btree ("status");--> statement-breakpoint
CREATE INDEX "project_client_idx" ON "project" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "project_deadline_idx" ON "project" USING btree ("submission_deadline");--> statement-breakpoint
CREATE INDEX "project_country_idx" ON "project" USING btree ("country");--> statement-breakpoint
CREATE UNIQUE INDEX "project_lot_code_idx" ON "project_lot" USING btree ("project_id","code");--> statement-breakpoint
CREATE INDEX "project_lot_project_idx" ON "project_lot" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "drawing_page_idx" ON "drawing" USING btree ("source_file_id","page_number");--> statement-breakpoint
CREATE INDEX "drawing_project_idx" ON "drawing" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "drawing_annotation_drawing_idx" ON "drawing_annotation" USING btree ("drawing_id");--> statement-breakpoint
CREATE INDEX "source_file_project_idx" ON "source_file" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "source_file_sha_idx" ON "source_file" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "material_name_idx" ON "material" USING btree ("name");--> statement-breakpoint
CREATE INDEX "price_history_item_idx" ON "price_history" USING btree ("price_item_id");--> statement-breakpoint
CREATE INDEX "price_item_trade_idx" ON "price_item" USING btree ("trade_family","country");--> statement-breakpoint
CREATE INDEX "price_item_designation_idx" ON "price_item" USING btree ("designation");--> statement-breakpoint
CREATE INDEX "price_item_code_idx" ON "price_item" USING btree ("code");--> statement-breakpoint
CREATE INDEX "price_item_date_idx" ON "price_item" USING btree ("price_date");--> statement-breakpoint
CREATE INDEX "supplier_name_idx" ON "supplier" USING btree ("name");--> statement-breakpoint
CREATE INDEX "technical_reference_code_idx" ON "technical_reference" USING btree ("code");--> statement-breakpoint
CREATE INDEX "technical_reference_scope_idx" ON "technical_reference" USING btree ("scope","kind");--> statement-breakpoint
CREATE INDEX "cctp_document_project_idx" ON "cctp_document" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "cctp_section_document_idx" ON "cctp_section" USING btree ("document_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "document_version_unique_idx" ON "document_version" USING btree ("document_type","document_id","version");--> statement-breakpoint
CREATE INDEX "document_version_project_idx" ON "document_version" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "dpgf_project_idx" ON "dpgf" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "dpgf_line_dpgf_idx" ON "dpgf_line" USING btree ("dpgf_id","position");--> statement-breakpoint
CREATE INDEX "dpgf_line_work_item_idx" ON "dpgf_line" USING btree ("work_item_id");--> statement-breakpoint
CREATE INDEX "measurement_project_idx" ON "measurement" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "measurement_work_item_idx" ON "measurement" USING btree ("work_item_id");--> statement-breakpoint
CREATE INDEX "price_breakdown_project_idx" ON "price_breakdown" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "price_breakdown_line_idx" ON "price_breakdown" USING btree ("dpgf_line_id");--> statement-breakpoint
CREATE INDEX "price_breakdown_component_breakdown_idx" ON "price_breakdown_component" USING btree ("breakdown_id","position");--> statement-breakpoint
CREATE INDEX "work_item_project_idx" ON "work_item" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "work_item_lot_idx" ON "work_item" USING btree ("lot_id");--> statement-breakpoint
CREATE INDEX "currency_rate_pair_idx" ON "currency_rate" USING btree ("base_currency","quote_currency","observed_at");--> statement-breakpoint
CREATE INDEX "quote_status_idx" ON "quote" USING btree ("status");--> statement-breakpoint
CREATE INDEX "quote_project_idx" ON "quote" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "quote_event_quote_idx" ON "quote_event" USING btree ("quote_id");--> statement-breakpoint
CREATE INDEX "quote_line_quote_idx" ON "quote_line" USING btree ("quote_id","position");--> statement-breakpoint
CREATE INDEX "agent_run_project_idx" ON "agent_run" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "agent_run_started_idx" ON "agent_run" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "ai_usage_record_created_idx" ON "ai_usage_record" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "generation_artifact_project_idx" ON "generation_artifact" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "generation_job_status_idx" ON "generation_job" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "generation_job_project_idx" ON "generation_job" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "generation_step_job_idx" ON "generation_step" USING btree ("job_id","position");--> statement-breakpoint
CREATE INDEX "audit_log_occurred_idx" ON "audit_log" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "audit_log_action_idx" ON "audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "notification_unread_idx" ON "notification" USING btree ("read_at","created_at");--> statement-breakpoint
CREATE INDEX "quality_issue_project_idx" ON "quality_issue" USING btree ("project_id","status");