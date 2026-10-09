/**
 * Réglages de l'application (table app_setting), validés à l'écriture comme à la lecture.
 * Aucune valeur métier n'est supposée : les barèmes de prix des modèles, par exemple, sont saisis.
 */
import { z } from "zod";
import { MARGIN_MODES, RATE_BASES } from "./enums.js";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur au format #RRGGBB.");
const usdDecimal = z
  .string()
  .trim()
  .transform((v) => v.replace(",", "."))
  .refine((v) => v === "" || /^\d{1,6}(\.\d{1,6})?$/.test(v), "Montant invalide.");

/** Paramètres IA. Les modèles sont choisis parmi ceux que l'API OpenAI déclare disponibles. */
export const aiSettings = z.object({
  /** Modèle de raisonnement et de rédaction (CCTP, synthèses, assistant). */
  generationModel: z.string().trim().max(100).default(""),
  /** Modèle d'extraction (lecture de plans et de documents, sorties structurées). */
  extractionModel: z.string().trim().max(100).default(""),
  /** Plafond mensuel de dépense (dollars US) : au-delà, les nouvelles générations sont refusées. Vide : aucun plafond. */
  monthlyBudgetUsd: usdDecimal.default(""),
  /** Barème par modèle (dollars US pour 1 million de jetons), recopié depuis la grille officielle OpenAI. */
  pricing: z
    .record(z.string(), z.object({ input: usdDecimal, cachedInput: usdDecimal.default(""), output: usdDecimal }))
    .default({}),
  /** Conservation des réponses côté OpenAI (désactivée par défaut). */
  storeResponses: z.boolean().default(false),
});
export type AiSettings = z.output<typeof aiSettings>;

/** Identité documentaire : présentation des livrables (séparée des données métier). */
export const documentIdentity = z.object({
  primaryColor: hexColor.default("#A0411E"),
  secondaryColor: hexColor.default("#B88D5E"),
  inkColor: hexColor.default("#171717"),
  headingFont: z.enum(["Instrument Serif", "Manrope"]).default("Instrument Serif"),
  bodyFont: z.enum(["Manrope"]).default("Manrope"),
  coverStyle: z.enum(["arche", "sobre"]).default("arche"),
  showLogoOnPages: z.boolean().default(true),
  footerText: z.string().trim().max(200).default("Talab Solutions"),
});
export type DocumentIdentity = z.output<typeof documentIdentity>;

/** Alertes : seuils de rappel et d'ancienneté des prix. */
export const alertSettings = z.object({
  stalePriceMonths: z.coerce.number().int().min(1).max(120).default(12),
  deadlineReminderDays: z.array(z.coerce.number().int().min(0).max(60)).max(6).default([7, 3, 1]),
});
export type AlertSettings = z.output<typeof alertSettings>;

const optionalPercent = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s/g, "").replace(",", "."))
  .refine((v) => v === "" || /^\d{1,4}(\.\d{1,4})?$/.test(v), "Valeur invalide.");

/**
 * Chiffrage : taux appliqués aux sous-détails, chacun avec son assiette. Vides par défaut :
 * sans taux saisi, le prix de vente est égal au déboursé (aucun taux supposé).
 */
export const pricingSettings = z.object({
  overheadRate: optionalPercent.default(""),
  overheadBase: z.enum(RATE_BASES).default("debourse_total"),
  contingencyRate: optionalPercent.default(""),
  contingencyBase: z.enum(RATE_BASES).default("debourse_total"),
  marginRate: optionalPercent.default(""),
  marginMode: z.enum(MARGIN_MODES).default("taux_de_marge"),
});
export type PricingSettings = z.output<typeof pricingSettings>;

export const SETTINGS = {
  ia: aiSettings,
  identite_documentaire: documentIdentity,
  alertes: alertSettings,
  chiffrage: pricingSettings,
} as const;
export type SettingKey = keyof typeof SETTINGS;
