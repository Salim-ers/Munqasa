/**
 * Schémas de validation partagés : les mêmes règles valident les formulaires (interface) et les
 * requêtes (serveur). Les montants et quantités circulent en chaînes décimales (aucun flottant).
 */
import { z } from "zod";
import {
  COUNTRIES,
  CURRENCIES,
  DEADLINE_KINDS,
  DESIGN_PHASES,
  FILE_KINDS,
  MARKET_TYPES,
  PROJECT_STATUSES,
  PROSPECT_STATUSES,
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
