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

const builders: Record<string, (input: string) => unknown> = {
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
