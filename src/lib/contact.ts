/**
 * Schéma du formulaire de contact — partagé entre le navigateur (retour
 * immédiat) et le serveur (validation qui fait foi). Module pur, sans
 * dépendance : il est importé par api/contact.ts.
 */

export const CONSULTATION_TYPES = {
  "marche-public": "Marché public",
  "ao-prive": "Appel d’offres privé",
  consultation: "Consultation",
  autre: "Autre",
} as const;

export const NEEDS = {
  veille: "Veille",
  analyse: "Analyse",
  "dossier-administratif": "Dossier administratif",
  "offre-technique": "Offre technique",
  coordination: "Coordination",
  audit: "Audit avant dépôt",
  soumission: "Préparation à la soumission",
  suivi: "Suivi",
  global: "Accompagnement global",
} as const;

export type ConsultationType = keyof typeof CONSULTATION_TYPES;
export type Need = keyof typeof NEEDS;

export interface ContactRequest {
  fullName: string;
  company: string;
  email: string;
  phone: string;
  consultationType: ConsultationType;
  reference: string;
  deadline: string;
  needs: Need[];
  message: string;
  consent: true;
}

export type ContactField = keyof ContactRequest;
export type ContactErrors = Partial<Record<ContactField, string>>;

export const LIMITS = {
  fullName: 120,
  company: 160,
  email: 254,
  phone: 24,
  reference: 120,
  message: 4000,
} as const;

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Une ligne : contrôles retirés, espaces normalisés, longueur bornée. */
export function cleanLine(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.normalize("NFC").replace(CONTROL, "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, max);
}

/** Texte libre : retours à la ligne conservés, contrôles retirés. */
export function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.normalize("NFC").replace(/\r\n?/g, "\n").replace(CONTROL, "").replace(/\n{4,}/g, "\n\n\n").trim().slice(0, max);
}

const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;
const PHONE = /^[+\d][\d\s().-]{5,23}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
}

export type ValidationResult =
  | { ok: true; data: ContactRequest }
  | { ok: false; errors: ContactErrors };

export function validateContact(input: Record<string, unknown>): ValidationResult {
  const errors: ContactErrors = {};

  const fullName = cleanLine(input.fullName, LIMITS.fullName);
  const company = cleanLine(input.company, LIMITS.company);
  const email = cleanLine(input.email, LIMITS.email).toLowerCase();
  const phone = cleanLine(input.phone, LIMITS.phone);
  const reference = cleanLine(input.reference, LIMITS.reference);
  const deadline = cleanLine(input.deadline, 10);
  const message = cleanText(input.message, LIMITS.message);
  const type = cleanLine(input.consultationType, 32);
  const rawNeeds = Array.isArray(input.needs) ? input.needs : [];
  const needs = [...new Set(rawNeeds.filter((n): n is Need => typeof n === "string" && n in NEEDS))];

  if (fullName.length < 2) errors.fullName = "Indiquez votre nom complet.";
  if (company.length < 2) errors.company = "Indiquez le nom de l’entreprise.";
  if (!EMAIL.test(email)) errors.email = "Adresse e-mail invalide.";
  if (phone && !PHONE.test(phone)) errors.phone = "Numéro de téléphone invalide.";
  if (!(type in CONSULTATION_TYPES)) errors.consultationType = "Choisissez le type de consultation.";
  if (deadline && !isValidDate(deadline)) errors.deadline = "Date invalide.";
  if (needs.length === 0) errors.needs = "Sélectionnez au moins un besoin.";
  if (input.consent !== true) errors.consent = "Votre accord est nécessaire pour traiter la demande.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    data: {
      fullName,
      company,
      email,
      phone,
      consultationType: type as ConsultationType,
      reference,
      deadline,
      needs,
      message,
      consent: true,
    },
  };
}

/** Corps texte de l'e-mail transmis à MUNAQASA (aucun HTML : pas d'injection). */
export function formatContactEmail(d: ContactRequest): { subject: string; text: string } {
  const subject = cleanLine(`Demande de ${d.company}, ${CONSULTATION_TYPES[d.consultationType]}`, 140);
  const lines = [
    `Nom complet : ${d.fullName}`,
    `Entreprise : ${d.company}`,
    `E-mail : ${d.email}`,
    `Téléphone : ${d.phone || "non renseigné"}`,
    `Type : ${CONSULTATION_TYPES[d.consultationType]}`,
    `Référence de la consultation : ${d.reference || "non renseigné"}`,
    `Date limite : ${d.deadline || "non renseigné"}`,
    `Besoins : ${d.needs.map((n) => NEEDS[n]).join(", ")}`,
    "",
    "Message :",
    d.message || "non renseigné",
  ];
  return { subject, text: lines.join("\n") };
}
