/**
 * Préremplissage d'une affaire depuis ses plans : le texte vectoriel des premières pages (cartouche, titres,
 * mentions), lu dans le navigateur, est confié à l'agent d'analyse documentaire, qui désigne l'intitulé de
 * l'opération, le maître d'ouvrage, l'adresse et la commune du site et la nature des travaux, chacun avec le
 * passage cité mot pour mot.
 *
 * Garde-fous du serveur : une valeur n'est retenue que si le passage cité figure dans le texte transmis et
 * contient la valeur ; le pays n'est déduit que d'un client déjà connu ; le type d'opération découle de
 * mots de l'intitulé retenu. Tout le reste est laissé à l'utilisateur.
 */
import { callAgent } from "../ai/client.js";
import { projectPrefill } from "../ai/schemas.js";
import { type Database, schema } from "../db/index.js";
import type { Country } from "../../shared/enums.js";

export interface PrefillField {
  value: string;
  /** Plan dont la valeur est tirée. */
  file: string;
  /** Passage cité, tel qu'écrit sur le plan. */
  quote: string;
}

export interface ProjectPrefill {
  name: PrefillField | null;
  client: (PrefillField & { clientId: string | null; clientName: string | null }) | null;
  siteAddress: PrefillField | null;
  city: PrefillField | null;
  worksNature: PrefillField | null;
  /** Type d'opération déduit de l'intitulé retenu (modèle de lots). */
  projectType: { value: "batiment" | "logements" | "rehabilitation" | "vrd"; reason: string } | null;
  /** Pays du client déjà connu, seul pays tenu pour fiable. */
  country: { value: Country; reason: string } | null;
  /** Valeurs écartées faute de passage vérifiable, et remarques de l'agent. */
  notes: string[];
}

/** Texte au plus transmis par plan, et au total. */
const PER_FILE = 6_000;
const TOTAL = 24_000;

const INSTRUCTIONS = `Tu es assistant d'économiste de la construction. On te donne le texte vectoriel de plans d'un projet (cartouches, titres, mentions), tel qu'il est écrit.
Relève, uniquement s'ils figurent dans ce texte :
- « name » : l'intitulé de l'opération ou du projet (par exemple « Construction de 11 logements dans le centre bourg de Ferrières-sur-Ariège ») ;
- « client » : le maître d'ouvrage (désigné par « Maître d'ouvrage », « Maîtrise d'ouvrage », « MOA », « Client »…), jamais l'architecte, le maître d'œuvre, un bureau d'études ou un contrôleur technique ;
- « siteAddress » : l'adresse du terrain ou du chantier, jamais celle d'un intervenant ;
- « city » : la commune du chantier ;
- « worksNature » : la nature des travaux (construction neuve, réhabilitation, extension, aménagement…) seulement si elle est écrite.
Règles strictes :
- pour chaque valeur, « quote » recopie mot pour mot le passage du texte qui la porte (une ligne ou deux lignes consécutives) ; « value » est la valeur remise en forme lisible (casse et ponctuation), sans aucun mot absent du passage ;
- une valeur absente, ambiguë ou qui pourrait désigner un intervenant est mise à null ;
- « notes » signale brièvement les doutes.
Réponds en français.`;

/** Texte comparable : sans accents ni ponctuation, en minuscules, espaces simples. */
export function comparable(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Valeur retenue si le passage cité figure dans le texte d'un plan et contient chacun des mots de la valeur. */
export function verifiedField(field: { value: string; quote: string } | null, files: Array<{ name: string; text: string }>): PrefillField | null {
  if (!field?.value?.trim() || !field.quote?.trim()) return null;
  const quote = comparable(field.quote);
  const value = comparable(field.value);
  if (!quote || !value) return null;
  const file = files.find((f) => comparable(f.text).includes(quote));
  if (!file) return null;
  const words = new Set(quote.split(" "));
  if (!value.split(" ").every((w) => words.has(w))) return null;
  return { value: field.value.trim().replace(/\s+/g, " ").slice(0, 300), file: file.name, quote: field.quote.trim().replace(/\s+/g, " ").slice(0, 300) };
}

/** Type d'opération d'après des mots de l'intitulé. */
export function projectTypeOf(name: string): ProjectPrefill["projectType"] {
  const text = comparable(name);
  if (/\blogements?\b/.test(text)) return { value: "logements", reason: "intitulé : logements" };
  if (/\b(rehabilitation|renovation|restructuration|refection|mise aux normes)\b/.test(text)) return { value: "rehabilitation", reason: "intitulé : travaux sur existant" };
  if (/\b(vrd|voirie|voiries|amenagements? exterieurs?|reseaux|assainissement)\b/.test(text) && !/\b(construction|batiment|immeuble)\b/.test(text)) return { value: "vrd", reason: "intitulé : voirie et réseaux" };
  return { value: "batiment", reason: "intitulé : bâtiment" };
}

export async function prefillProject(db: Database, files: Array<{ name: string; text: string }>): Promise<ProjectPrefill> {
  let room = TOTAL;
  const sent = files.map((f) => {
    const text = f.text.replace(/[ \t]+/g, " ").slice(0, Math.max(0, Math.min(PER_FILE, room)));
    room -= text.length;
    return { name: f.name, text };
  });
  const output = await callAgent({
    agent: "analyste_documents",
    role: "extraction",
    projectId: null,
    jobId: null,
    instructions: INSTRUCTIONS,
    input: sent.map((f) => `Plan : ${f.name}\nTexte vectoriel :\n${f.text}`).join("\n\n"),
    schema: projectPrefill,
    schemaName: "prefill_affaire",
    summary: `Préremplissage d’une affaire depuis ${sent.length} plan(s)`,
    maxOutputTokens: 2_000,
    effort: "low",
  });

  const notes = output.notes.map((n) => n.trim()).filter(Boolean).slice(0, 6);
  const keep = (label: string, field: { value: string; quote: string } | null) => {
    const verified = verifiedField(field, sent);
    if (field?.value?.trim() && !verified) notes.push(`${label} proposé sans passage vérifiable sur les plans : non repris.`);
    return verified;
  };
  const name = keep("Intitulé", output.name);
  const clientField = keep("Maître d’ouvrage", output.client);
  let client: ProjectPrefill["client"] = null;
  let country: ProjectPrefill["country"] = null;
  if (clientField) {
    const target = comparable(clientField.value);
    const known = (await db.select({ id: schema.client.id, name: schema.client.name, country: schema.client.country, archivedAt: schema.client.archivedAt }).from(schema.client)).filter((c) => !c.archivedAt);
    const match = known.find((c) => comparable(c.name) === target) ?? known.find((c) => comparable(c.name).length > 3 && (target.includes(comparable(c.name)) || comparable(c.name).includes(target)));
    client = { ...clientField, clientId: match?.id ?? null, clientName: match?.name ?? null };
    if (match) country = { value: match.country, reason: `pays du client ${match.name}` };
  }
  return {
    name,
    client,
    siteAddress: keep("Adresse du site", output.siteAddress),
    city: keep("Commune", output.city),
    worksNature: keep("Nature des travaux", output.worksNature),
    projectType: name ? projectTypeOf(name.value) : null,
    country,
    notes,
  };
}
