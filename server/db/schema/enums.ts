/**
 * Énumérations PostgreSQL : les valeurs autorisées sont garanties par la base elle-même.
 * Source unique des valeurs : shared/enums.ts (partagé avec l'interface et la validation Zod).
 */
import { pgEnum } from "drizzle-orm/pg-core";
import {
  COMPONENT_CATEGORIES,
  COUNTRIES,
  CURRENCIES,
  DESIGN_PHASES,
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
  DPGF_LINE_KINDS,
  DRAWING_KINDS,
  FILE_KINDS,
  FILE_STATUSES,
  ISSUE_CATEGORIES,
  ISSUE_SEVERITIES,
  ISSUE_STATUSES,
  JOB_KINDS,
  JOB_STATUSES,
  LINE_STATUSES,
  MARGIN_MODES,
  MARKET_TYPES,
  MEASURE_METHODS,
  MEASURE_SOURCES,
  NOTIFICATION_KINDS,
  PRICE_BATCH_STATUSES,
  PRICE_KINDS,
  PRICE_ORIGINS,
  PRICE_ROW_DECISIONS,
  PRICE_SCOPES,
  PRICE_VALUE_STATUSES,
  PROJECT_STATUSES,
  PROSPECT_STATUSES,
  QUOTE_EVENT_KINDS,
  QUOTE_LINE_KINDS,
  QUOTE_STATUSES,
  RATE_BASES,
  RATE_KINDS,
  REFERENCE_KINDS,
  REFERENCE_SCOPES,
  RELIABILITY_LEVELS,
  SECTION_STATUSES,
  SECTORS,
  STEP_STATUSES,
  TAX_BASES,
  VALIDATION_STATUSES,
} from "../../../shared/enums.js";
import { MEASURE_CONFIDENCES } from "../../../shared/metre.js";

export const countryEnum = pgEnum("country_code", COUNTRIES);
export const currencyEnum = pgEnum("currency_code", CURRENCIES);
export const projectStatusEnum = pgEnum("project_status", PROJECT_STATUSES);
export const marketTypeEnum = pgEnum("market_type", MARKET_TYPES);
export const sectorEnum = pgEnum("sector", SECTORS);
export const designPhaseEnum = pgEnum("design_phase", DESIGN_PHASES);
export const prospectStatusEnum = pgEnum("prospect_status", PROSPECT_STATUSES);
export const fileKindEnum = pgEnum("file_kind", FILE_KINDS);
export const fileStatusEnum = pgEnum("file_status", FILE_STATUSES);
export const drawingKindEnum = pgEnum("drawing_kind", DRAWING_KINDS);
export const validationStatusEnum = pgEnum("validation_status", VALIDATION_STATUSES);
export const measureMethodEnum = pgEnum("measure_method", MEASURE_METHODS);
export const measureSourceEnum = pgEnum("measure_source", MEASURE_SOURCES);
export const measureConfidenceEnum = pgEnum("measure_confidence", MEASURE_CONFIDENCES);
export const referenceKindEnum = pgEnum("reference_kind", REFERENCE_KINDS);
export const referenceScopeEnum = pgEnum("reference_scope", REFERENCE_SCOPES);
export const priceOriginEnum = pgEnum("price_origin", PRICE_ORIGINS);
export const priceKindEnum = pgEnum("price_kind", PRICE_KINDS);
export const priceScopeEnum = pgEnum("price_scope", PRICE_SCOPES);
export const taxBasisEnum = pgEnum("tax_basis", TAX_BASES);
export const priceValueStatusEnum = pgEnum("price_value_status", PRICE_VALUE_STATUSES);
export const reliabilityEnum = pgEnum("reliability", RELIABILITY_LEVELS);
export const priceBatchStatusEnum = pgEnum("price_batch_status", PRICE_BATCH_STATUSES);
export const priceRowDecisionEnum = pgEnum("price_row_decision", PRICE_ROW_DECISIONS);
export const documentStatusEnum = pgEnum("document_status", DOCUMENT_STATUSES);
export const sectionStatusEnum = pgEnum("section_status", SECTION_STATUSES);
export const dpgfLineKindEnum = pgEnum("dpgf_line_kind", DPGF_LINE_KINDS);
export const lineStatusEnum = pgEnum("line_status", LINE_STATUSES);
export const componentCategoryEnum = pgEnum("component_category", COMPONENT_CATEGORIES);
/** Définition explicite de la marge, pour ne jamais compter deux fois les mêmes frais. */
export const marginModeEnum = pgEnum("margin_mode", MARGIN_MODES);
export const rateBaseEnum = pgEnum("rate_base", RATE_BASES);
export const quoteStatusEnum = pgEnum("quote_status", QUOTE_STATUSES);
export const quoteLineKindEnum = pgEnum("quote_line_kind", QUOTE_LINE_KINDS);
export const quoteEventKindEnum = pgEnum("quote_event_kind", QUOTE_EVENT_KINDS);
export const rateKindEnum = pgEnum("rate_kind", RATE_KINDS);
export const documentTypeEnum = pgEnum("document_type", DOCUMENT_TYPES);
export const jobKindEnum = pgEnum("job_kind", JOB_KINDS);
export const jobStatusEnum = pgEnum("job_status", JOB_STATUSES);
export const stepStatusEnum = pgEnum("step_status", STEP_STATUSES);
export const issueSeverityEnum = pgEnum("issue_severity", ISSUE_SEVERITIES);
export const issueCategoryEnum = pgEnum("issue_category", ISSUE_CATEGORIES);
export const issueStatusEnum = pgEnum("issue_status", ISSUE_STATUSES);
export const notificationKindEnum = pgEnum("notification_kind", NOTIFICATION_KINDS);
