/**
 * Schémas de validation partagés : les mêmes règles valident les formulaires (interface) et les
 * requêtes (serveur). Les montants et quantités circulent en chaînes décimales (aucun flottant).
 */
import { z } from "zod";
import {
  COUNTRIES,
  CURRENCIES,
  DEADLINE_KINDS,
  COMPONENT_CATEGORIES,
  DESIGN_PHASES,
  FILE_KINDS,
  MARKET_TYPES,
  MEASURE_METHODS,
  PROJECT_STATUSES,
  PRICE_KINDS,
  PRICE_ORIGINS,
  PROSPECT_STATUSES,
  REFERENCE_KINDS,
  REFERENCE_SCOPES,
  SECTORS,
} from "./enums.js";
import { TRADE_KEYS } from "./trades.js";

/** Messages d'erreur en français, lisibles par l'utilisateur (interface comme serveur). */
z.config({
  customError: (issue) => {
    switch (issue.code) {
      case "invalid_type":
        return issue.input === undefined || issue.input === null ? "Champ obligatoire." : "Valeur invalide.";
      case "invalid_value":
        return "Choisissez une valeur dans la liste.";
      case "too_big":
        return issue.origin === "string" ? `${issue.maximum} caractères au plus.` : `Valeur trop grande (${issue.maximum} au plus).`;
      case "too_small":
        if (issue.origin === "string") return issue.minimum === 1 ? "Champ obligatoire." : `${issue.minimum} caractères au moins.`;
        return `Valeur trop petite (${issue.minimum} au moins).`;
      case "invalid_format":
        return issue.format === "email" ? "Adresse e-mail invalide." : issue.format === "datetime" ? "Date et heure invalides." : "Format invalide.";
      case "invalid_union":
        return "Valeur invalide.";
      default:
        return undefined;
    }
  },
});

/** Texte facultatif : chaîne vide → null. */
const optionalText = (max = 2000) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

const requiredText = (max = 200) => z.string().trim().min(1, "Champ obligatoire.").max(max);

/** Nombre décimal en chaîne (« 1 250,50 » devient « 1250.50 »), sans flottant. */
const decimal = (scale: number, message: string, signed = true) =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(/\s/g, "").replace(",", "."))
    .refine((v) => new RegExp(`^${signed ? "-?" : ""}\\d{1,16}(\\.\\d{1,${scale}})?$`).test(v), message);

/** Quantité, prix unitaire, taux : jusqu'à 4 décimales. */
export const decimalString = decimal(4, "Nombre invalide (jusqu’à 4 décimales).");

const optionalNumber = (scale: number, message: string, signed = true) =>
  z
    .union([decimal(scale, message, signed), z.literal(""), z.null()], { error: message })
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v));

const optionalDecimal = optionalNumber(4, "Nombre invalide (jusqu’à 4 décimales).");
/** Montant positif, 2 décimales (colonnes monétaires). */
const optionalMoney = optionalNumber(2, "Montant invalide (2 décimales au plus).", false);

/** Date et heure ISO (ou vide). */
const optionalDateTime = z
  .union([z.string().datetime({ offset: true }), z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/), z.literal(""), z.null()], { error: "Date et heure invalides." })
  .optional()
  .transform((v) => (v ? new Date(v).toISOString() : null));

const optionalDate = z
  .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(""), z.null()], { error: "Date invalide." })
  .optional()
  .transform((v) => (v ? v : null));

const optionalEmail = z
  .union([z.string().trim().email("Adresse e-mail invalide."), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v.toLowerCase() : null));

const optionalUuid = z
  .union([z.string().uuid(), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

/** Identifiants légaux (ICE, RC, SIRET…) : les champs laissés vides ne sont pas conservés. */
const legalIds = z
  .record(z.string().max(40), z.string().trim().max(100))
  .transform((ids) => Object.fromEntries(Object.entries(ids).filter(([, v]) => v !== "")))
  .optional()
  .default({});

/** Identifiants légaux proposés selon le pays. */
export const LEGAL_ID_FIELDS = {
  MA: [
    { key: "ice", label: "ICE" },
    { key: "rc", label: "Registre du commerce (RC)" },
    { key: "if", label: "Identifiant fiscal (IF)" },
    { key: "patente", label: "Taxe professionnelle (patente)" },
    { key: "cnss", label: "CNSS" },
  ],
  FR: [
    { key: "siret", label: "SIRET" },
    { key: "rcs", label: "RCS" },
    { key: "tva", label: "TVA intracommunautaire" },
    { key: "naf", label: "Code NAF / APE" },
  ],
} as const satisfies Record<(typeof COUNTRIES)[number], ReadonlyArray<{ key: string; label: string }>>;

/* ---------- Clients et prospects ---------- */

export const clientInput = z.object({
  name: requiredText(),
  sector: z.enum(SECTORS),
  legalForm: optionalText(100),
  country: z.enum(COUNTRIES),
  city: optionalText(120),
  address: optionalText(500),
  contactName: optionalText(150),
  email: optionalEmail,
  phone: optionalText(40),
  legalIds,
  notes: optionalText(5000),
});
export type ClientInput = z.input<typeof clientInput>;

export const prospectInput = z.object({
  name: requiredText(),
  company: optionalText(200),
  country: z.enum(COUNTRIES),
  city: optionalText(120),
  email: optionalEmail,
  phone: optionalText(40),
  source: optionalText(200),
  status: z.enum(PROSPECT_STATUSES).default("nouveau"),
  notes: optionalText(5000),
});
export type ProspectInput = z.input<typeof prospectInput>;

/* ---------- Affaires ---------- */

export const projectInput = z.object({
  name: requiredText(300),
  clientId: optionalUuid,
  country: z.enum(COUNTRIES),
  city: optionalText(120),
  siteAddress: optionalText(500),
  marketType: z.enum(MARKET_TYPES),
  sector: z.enum(SECTORS),
  worksNature: optionalText(300),
  designPhase: z.enum(DESIGN_PHASES).default("dce"),
  currency: z.enum(CURRENCIES),
  submissionDeadline: optionalDateTime,
  startDate: optionalDate,
  description: optionalText(20000),
  hypotheses: optionalText(20000),
  constraints: optionalText(20000),
  manualEstimate: optionalMoney,
});
export type ProjectInput = z.input<typeof projectInput>;

/** Modification d'une affaire (le serveur ne retient que les champs envoyés). */
export const projectPatch = projectInput.extend({ status: z.enum(PROJECT_STATUSES) });

export const projectLotInput = z.object({
  code: requiredText(20),
  name: requiredText(200),
  tradeFamily: z.enum(TRADE_KEYS),
});
export type ProjectLotInput = z.input<typeof projectLotInput>;

export const deadlineInput = z.object({
  projectId: optionalUuid,
  title: requiredText(300),
  kind: z.enum(DEADLINE_KINDS).default("jalon"),
  dueAt: z
    .union([z.string().datetime({ offset: true }), z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)], { error: "Indiquez la date et l’heure." })
    .transform((v) => new Date(v).toISOString()),
  notes: optionalText(5000),
});
export type DeadlineInput = z.input<typeof deadlineInput>;

/* ---------- Métré ---------- */

export const workItemInput = z.object({
  lotId: optionalUuid,
  code: optionalText(30),
  designation: requiredText(300),
  unit: requiredText(20),
  location: optionalText(200),
  description: optionalText(5000),
});
export type WorkItemInput = z.input<typeof workItemInput>;

/** Mesure : formule et entrées nommées ; la quantité est toujours calculée par le serveur. */
export const measurementInput = z.object({
  label: requiredText(300),
  method: z.enum(MEASURE_METHODS),
  formula: requiredText(300),
  inputs: z
    .array(z.object({ name: z.string().trim().regex(/^[A-Za-z_][A-Za-z0-9_]{0,30}$/, "Nom de variable invalide."), value: z.string().trim().min(1, "Valeur obligatoire.").max(30) }))
    .max(20),
  unit: requiredText(20),
  drawingId: optionalUuid,
  zoneRef: optionalText(200),
  notes: optionalText(5000),
});
export type MeasurementInput = z.input<typeof measurementInput>;

/** Lancement de l'agent de lecture des plans : envoi des pages à l'API OpenAI confirmé explicitement. */
export const planAnalysisRequest = z.object({
  fileIds: z.array(z.string().uuid()).min(1, "Choisissez au moins un plan.").max(30),
  lotId: optionalUuid,
  consent: z.literal(true, { error: "Confirmez l’envoi des plans à l’API OpenAI." }),
});

/* ---------- Référentiel et CCTP ---------- */

export const referenceInput = z.object({
  scope: z.enum(REFERENCE_SCOPES),
  kind: z.enum(REFERENCE_KINDS),
  code: requiredText(100),
  title: requiredText(400),
  version: optionalText(150),
  publishedOn: optionalDate,
  domain: optionalText(100),
  sourceUrl: z
    .union([z.string().trim().url("Adresse web invalide."), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v ? v : null)),
  notes: optionalText(3000),
});
export type ReferenceInput = z.input<typeof referenceInput>;

export const CCTP_LEVELS = ["synthetique", "standard", "detaille"] as const;
export const CCTP_LEVEL_LABELS: Record<(typeof CCTP_LEVELS)[number], string> = { synthetique: "Synthétique", standard: "Standard", detaille: "Détaillé" };

/** Lancement de la rédaction : informations de l'affaire transmises à l'API OpenAI avec accord explicite. */
export const cctpGenerationRequest = z.object({
  lotId: optionalUuid,
  detailLevel: z.enum(CCTP_LEVELS),
  useMetre: z.boolean(),
  referenceIds: z.array(z.string().uuid()).max(300),
  instructions: optionalText(3000),
  consent: z.literal(true, { error: "Confirmez l’envoi des informations de l’affaire à l’API OpenAI." }),
});

export const cctpBlockInput = z.object({
  type: z.enum(["paragraphe", "liste", "exigence", "note"]),
  text: z.string().trim().max(6000).nullable(),
  items: z.array(z.string().trim().max(1000)).max(60),
  referenceIds: z.array(z.string().uuid()).max(30),
});

export const cctpSectionUpdate = z.object({
  title: requiredText(300),
  blocks: z.array(cctpBlockInput).max(80),
});

export const cctpRewriteRequest = z.object({
  sectionIds: z.array(z.string().uuid()).min(1, "Choisissez au moins un article.").max(20),
  instructions: optionalText(2000),
  consent: z.literal(true, { error: "Confirmez l’envoi des informations de l’affaire à l’API OpenAI." }),
});

/* ---------- DPGF ---------- */

/** Taux en pourcentage (0 à 100), 4 décimales au plus, saisi : jamais supposé. */
const optionalRate = z
  .union([z.string().trim(), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v.replace(/\s/g, "").replace(",", ".") : null))
  .refine((v) => v === null || (/^\d{1,3}(\.\d{1,4})?$/.test(v) && Number(v) <= 100), "Taux invalide (entre 0 et 100).");

export const dpgfGenerationRequest = z.object({
  cctpDocumentId: z.string().uuid("Choisissez un CCTP."),
  vatRate: optionalRate,
  instructions: optionalText(2000),
  consent: z.literal(true, { error: "Confirmez l’envoi du CCTP et du métré à l’API OpenAI." }),
});

export const DPGF_LINE_KIND_LIST = ["chapitre", "sous_chapitre", "poste"] as const;

export const dpgfLineInput = z.object({
  kind: z.enum(DPGF_LINE_KIND_LIST),
  parentId: optionalUuid,
  designation: requiredText(500),
  description: optionalText(3000),
  unit: optionalText(20),
  quantity: optionalDecimal,
  unitPrice: optionalDecimal,
  cctpRef: optionalText(30),
});
export type DpgfLineInput = z.input<typeof dpgfLineInput>;

export const dpgfUpdate = z.object({
  title: requiredText(300),
  vatRate: optionalRate,
});

/* ---------- Bibliothèque de prix et sous-détails ---------- */

/** Prix unitaire strictement positif, 4 décimales au plus. */
const positivePrice = decimalString.refine((v) => Number(v) > 0, "Le prix doit être positif.");

export const priceItemInput = z.object({
  code: optionalText(50),
  designation: requiredText(500),
  kind: z.enum(PRICE_KINDS),
  unit: requiredText(20),
  unitPrice: positivePrice,
  currency: z.enum(CURRENCIES),
  country: z.enum(COUNTRIES),
  region: optionalText(100),
  city: optionalText(100),
  tradeFamily: optionalText(60),
  subFamily: optionalText(120),
  origin: z.enum(PRICE_ORIGINS),
  supplierId: optionalUuid,
  sourceRef: optionalText(300),
  priceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide."),
  commercialConditions: optionalText(2000),
});
export type PriceItemInput = z.input<typeof priceItemInput>;

export const supplierInput = z.object({
  name: requiredText(200),
  country: z.enum(COUNTRIES),
  city: optionalText(120),
  contactName: optionalText(150),
  email: optionalEmail,
  phone: optionalText(40),
  notes: optionalText(3000),
});

/** Fichier de prix (CSV ou Excel) transmis en base64 : 3 Mo au plus. */
export const priceFile = z.object({
  fileName: z.string().trim().min(1).max(255).regex(/\.(csv|txt|xlsx)$/i, "Fichier CSV ou Excel (.xlsx) attendu."),
  contentBase64: z.string().min(1).max(4_200_000, "Fichier trop volumineux (3 Mo au plus)."),
});

const columnRef = z.union([z.number().int().min(0).max(200), z.null()]);

export const priceImportRequest = priceFile.extend({
  sheet: z.string().max(100).nullable().optional(),
  headerRow: z.number().int().min(0).max(50),
  columns: z.object({
    designation: z.number().int().min(0).max(200),
    unit: z.number().int().min(0).max(200),
    unitPrice: z.number().int().min(0).max(200),
    code: columnRef,
    kind: columnRef,
    priceDate: columnRef,
  }),
  defaults: z.object({
    kind: z.enum(PRICE_KINDS),
    currency: z.enum(CURRENCIES),
    country: z.enum(COUNTRIES),
    origin: z.enum(PRICE_ORIGINS),
    priceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide."),
    tradeFamily: optionalText(60),
    supplierId: optionalUuid,
  }),
});

/** Lancement de l'agent des sous-détails : postes d'une DPGF, accord d'envoi. */
export const sousDetailRequest = z.object({
  lineIds: z.array(z.string().uuid()).max(400),
  instructions: optionalText(2000),
  consent: z.literal(true, { error: "Confirmez l’envoi des postes et des prix candidats à l’API OpenAI." }),
});

export const breakdownComponentInput = z.object({
  category: z.enum(COMPONENT_CATEGORIES),
  designation: requiredText(300),
  unit: requiredText(20),
  quantity: decimalString.refine((v) => Number(v) >= 0, "Quantité invalide."),
  unitCost: optionalDecimal,
  lossRate: optionalDecimal,
  priceItemId: optionalUuid,
  sourceNote: optionalText(1000),
});
export type BreakdownComponentInput = z.input<typeof breakdownComponentInput>;

/* ---------- Entreprise ---------- */

export const companyProfileInput = z.object({
  label: requiredText(100),
  legalName: requiredText(200),
  tradeName: optionalText(200),
  legalForm: optionalText(100),
  country: z.enum(COUNTRIES),
  address: optionalText(500),
  city: optionalText(120),
  postalCode: optionalText(20),
  email: optionalEmail,
  phone: optionalText(40),
  website: optionalText(200),
  legalIds,
  defaultCurrency: z.enum(CURRENCIES),
  defaultVatRate: optionalDecimal,
  quoteLegalMentions: optionalText(10000),
  paymentTerms: optionalText(5000),
});
export type CompanyProfileInput = z.input<typeof companyProfileInput>;

/* ---------- Fichiers ---------- */

/** 500 Mo par fichier : les plans et dossiers de consultation peuvent être volumineux. */
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

export const uploadRequest = z.object({
  projectId: optionalUuid,
  kind: z.enum(FILE_KINDS),
  fileName: z.string().trim().min(1).max(255),
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES, "Fichier trop volumineux (500 Mo au plus)."),
  /** Type annoncé par le navigateur, souvent vide pour les formats CAO : octet-stream par défaut. */
  contentType: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v && /^[\w.+-]+\/[\w.+-]+$/.test(v) ? v.toLowerCase() : "application/octet-stream")),
});
export type UploadRequest = z.input<typeof uploadRequest>;

/** Extensions admises (le type réel est ensuite vérifié sur la signature binaire). */
export const ALLOWED_EXTENSIONS = ["pdf", "png", "jpg", "jpeg", "tif", "tiff", "webp", "dxf", "dwg", "ifc", "zip", "docx", "xlsx", "xls", "csv", "txt"] as const;

/* ---------- Listes ---------- */

export const listQuery = z.object({
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.string().trim().max(50).optional(),
  dir: z.enum(["asc", "desc"]).optional().default("desc"),
});
