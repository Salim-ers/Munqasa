/**
 * Fournisseur simulé, pour les tests de bout en bout et les démonstrations locales sans clé :
 * il renvoie des sorties conformes aux schémas, construites à partir des entrées. Jamais actif en
 * production (voir client.ts : TALAB_FAKE_AI=1 hors production uniquement).
 */
import type { AiProvider } from "./client.js";

function textOf(input: unknown): string {
  return typeof input === "string" ? input : JSON.stringify(input);
}

/** Identifiants de planches présents dans l'entrée (relevés transmis au métreur). */
function drawingIdsIn(text: string): string[] {
  return [...text.matchAll(/"drawingId":"([0-9a-f-]{36})"/g)].map((m) => m[1]!);
}

/** Tableau JSON qui suit un intitulé dans l'entrée (« Références autorisées (JSON) : [...] »). */
function jsonAfter(text: string, label: string): unknown[] {
  const start = text.indexOf(label);
  if (start < 0) return [];
  const open = text.indexOf("[", start);
  if (open < 0) return [];
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "[") depth++;
    else if (text[i] === "]" && --depth === 0) {
      try {
        return JSON.parse(text.slice(open, i + 1)) as unknown[];
      } catch {
        return [];
      }
    }
  }
  return [];
}

const builders: Record<string, (input: string) => unknown> = {
  plan_cctp: (input) => {
    const codes = [...new Set([...input.matchAll(/"code":"(GO-[0-9]+)"/g)].map((m) => m[1]!))];
    return {
      title: "CCTP, lot 01 Gros œuvre",
      chapters: [
        {
          number: "1",
          title: "Généralités",
          articles: [
            { number: "1.1", title: "Objet du présent CCTP", intent: "Définir l’objet et la consistance des travaux du lot.", workItemCodes: [] },
            { number: "1.2", title: "Documents et références", intent: "Lister les références applicables.", workItemCodes: [] },
          ],
        },
        { number: "2", title: "Matériaux", articles: [{ number: "2.1", title: "Bétons", intent: "Prescrire les bétons et leur conformité.", workItemCodes: [] }] },
        {
          number: "3",
          title: "Mise en œuvre",
          articles: (codes.length ? codes : ["GO-01"]).map((code, i) => ({ number: `3.${i + 1}`, title: `Ouvrage ${code}`, intent: `Décrire la mise en œuvre de ${code}.`, workItemCodes: [code] })),
        },
      ],
    };
  },
  redaction_cctp: (input) => {
    const references = jsonAfter(input, "Références autorisées (JSON)") as Array<{ id: string; code: string }>;
    const articles = jsonAfter(input, "Articles à rédiger (JSON)") as Array<{ number: string; title: string }>;
    const ref = references[0];
    return {
      articles: articles.map((a) => ({
        number: a.number,
        blocks: [
          { type: "paragraphe", text: `Le présent article fixe les prescriptions relatives à « ${a.title} ».`, items: [], referenceIds: [] },
          ref
            ? { type: "exigence", text: `Les travaux sont exécutés conformément à ${ref.code}.`, items: [], referenceIds: [ref.id] }
            : { type: "exigence", text: "Les travaux sont exécutés selon les plans d’exécution visés.", items: [], referenceIds: [] },
          { type: "liste", text: null, items: ["Implantation contrôlée", "Réception des supports"], referenceIds: [] },
        ],
      })),
    };
  },
  releve_plan: () => ({
    sheet: { title: "Plan de fondations", number: "GO-01", kind: "plan_niveau", level: "Fondations", scale: "1/100", readable: true },
    elements: [
      {
        category: "fondation",
        designation: "Semelle filante SF1",
        location: "Pourtour",
        count: 1,
        material: "Béton armé",
        dimensions: [
          { name: "longueur", value: "42.50", unit: "m", source: "cote_lue" },
          { name: "largeur", value: "60", unit: "cm", source: "cote_lue" },
          { name: "hauteur", value: "40", unit: "cm", source: "texte_lu" },
        ],
        confidence: "elevee",
        note: null,
      },
    ],
    notes: ["Béton de propreté sous semelles."],
    uncertainties: [],
  }),
  metre: (input) => {
    const drawingId = drawingIdsIn(input)[0] ?? null;
    return {
      workItems: [
        {
          code: "GO-01",
          designation: "Béton armé pour semelles filantes",
          unit: "m3",
          location: "Pourtour",
          attributes: [{ name: "Section", value: "0,60 x 0,40 m", source: "Plan de fondations, SF1" }],
          measurements: [
            {
              label: "Semelle filante SF1",
              method: "volume",
              formula: "L * l * h",
              inputs: [
                { name: "L", value: "42.50", source: "cote lue, SF1" },
                { name: "l", value: "0.60", source: "cote lue, SF1" },
                { name: "h", value: "0.40", source: "texte lu, SF1" },
              ],
              unit: "m3",
              drawingId,
              zone: "Pourtour",
              note: null,
            },
          ],
        },
      ],
      warnings: [],
    };
  },
};

export const fakeProvider: AiProvider = {
  name: "simulation",
  async run(call) {
    const build = builders[call.schemaName];
    if (!build) throw new Error(`Simulation indisponible pour « ${call.schemaName} ».`);
    return { output: build(textOf(call.input)), usage: null, responseId: null };
  },
  async uploadFile() {
    return "fichier-simule";
  },
  async deleteFile() {},
};

/** Tests : ajout ou remplacement d'une sortie simulée. */
export function setFakeBuilder(schemaName: string, build: (input: string) => unknown): void {
  builders[schemaName] = build;
}
