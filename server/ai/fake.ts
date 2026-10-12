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
  dpgf_chapitre: (input) => {
    const title = /Chapitre \S+ du CCTP : (.*)/.exec(input)?.[1]?.trim() ?? "Chapitre";
    const articles = jsonAfter(input, "Articles (JSON)") as Array<{ numero: string; titre: string }>;
    const metre = jsonAfter(input, "Métré du lot (JSON)") as Array<{ code: string; designation: string; unite: string }>;
    if (/généralités/i.test(title)) {
      return {
        title: "Installation et généralités",
        groups: [{ title: null, postes: [{ designation: "Installation de chantier", description: null, unit: "ens", cctpArticle: articles[0]?.numero ?? null, workItemCode: null, quantityBasis: "forfait" }] }],
      };
    }
    if (/matériaux/i.test(title)) return { title, groups: [] };
    return {
      title,
      groups: [
        {
          title: null,
          postes: articles.map((a) => {
            const item = metre.find((m) => m.code && a.titre.includes(m.code));
            return { designation: item ? item.designation : a.titre, description: null, unit: item?.unite ?? "u", cctpArticle: a.numero, workItemCode: item?.code ?? null, quantityBasis: item ? "metre" : "a_metrer" };
          }),
        },
      ],
    };
  },
  sous_detail: (input) => {
    const postes = jsonAfter(input, "Postes (JSON)") as Array<{ lineId: string; prixCandidats: Array<{ id: string; designation: string; nature: string; unite: string }> }>;
    const category: Record<string, string> = { ouvrage: "sous_traitance", materiau: "materiau", main_oeuvre: "main_oeuvre", materiel: "materiel", sous_traitance: "sous_traitance", transport: "transport" };
    const quantity: Record<string, string> = { materiau: "1", main_oeuvre: "2.5", materiel: "0.5" };
    return {
      postes: postes.map((poste) => {
        const chosen = poste.prixCandidats.slice(0, 3);
        return {
          lineId: poste.lineId,
          components: chosen.length
            ? chosen.map((c) => ({
                category: category[c.nature] ?? "materiau",
                designation: c.designation,
                unit: c.unite,
                netQuantity: quantity[c.nature] ?? "1",
                lossRate: c.nature === "materiau" ? "5" : null,
                priceItemId: c.id,
                justification: "Ratio usuel à confirmer",
              }))
            : [{ category: "main_oeuvre", designation: "Main-d’œuvre de mise en œuvre", unit: "h", netQuantity: "2", lossRate: null, priceItemId: null, justification: "Aucun prix de main-d’œuvre dans la bibliothèque" }],
          impossible: null,
          notes: null,
        };
      }),
    };
  },
  devis_postes: (input) => {
    // Sources transmises : postes de DPGF et ouvrages du métré d'abord, sinon un poste tiré de la description.
    const start = input.indexOf("Sources (JSON)");
    const json = start >= 0 ? input.slice(input.indexOf("{", start)) : "{}";
    let sources: { description?: string | null; dpgf?: Array<{ id: string; designation: string; unite: string | null }>; metre?: Array<{ id: string; designation: string; unite: string | null }> } = {};
    try {
      sources = JSON.parse(json) as typeof sources;
    } catch {
      sources = {};
    }
    const postes: unknown[] = [];
    (sources.dpgf ?? []).slice(0, 20).forEach((p, i) => postes.push({ key: `d${i + 1}`, section: "Travaux de la DPGF", designation: p.designation, description: null, unit: p.unite, source: "dpgf", sourceId: p.id, quantity: null, quantityQuote: null }));
    (sources.metre ?? []).slice(0, 20).forEach((m, i) => postes.push({ key: `m${i + 1}`, section: "Ouvrages du métré", designation: m.designation, description: null, unit: m.unite, source: "metre", sourceId: m.id, quantity: null, quantityQuote: null }));
    const text = sources.description ?? "";
    const match = /(\d+(?:[.,]\d+)?)\s*(m²|m2|m³|m3|ml|u)(?![a-z0-9])([^.;,]*)/i.exec(text);
    if (match) postes.push({ key: "t1", section: null, designation: text.split(/[.;]/)[0]!.slice(0, 120), description: null, unit: match[2]!.replace("2", "²").replace("3", "³"), source: "description", sourceId: null, quantity: match[1]!.replace(",", "."), quantityQuote: match[0]!.trim() });
    else if (text) postes.push({ key: "t1", section: null, designation: text.split(/[.;]/)[0]!.slice(0, 120), description: null, unit: "forfait", source: "aucune", sourceId: null, quantity: null, quantityQuote: null });
    return { title: text ? text.split(/[.;]/)[0]!.slice(0, 80) : "Travaux de l’affaire", postes, questions: postes.length ? ["Confirmer les caractéristiques des ouvrages"] : [] };
  },
  devis_prix: (input) => {
    const postes = jsonAfter(input, "Postes (JSON)") as Array<{ key: string; prixCandidats: Array<{ id: string }> }>;
    return { choices: postes.map((p) => ({ key: p.key, priceItemId: p.prixCandidats[0]?.id ?? null, justification: p.prixCandidats.length ? "Candidat le plus proche" : null })) };
  },
  releve_plan: () => ({
    sheet: { title: "Plan de fondations", number: "GO-01", kind: "plan_niveau", level: "Fondations", scale: "1/100", revision: "B", readable: true },
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
                { name: "L", value: "42.50", source: "cote lue, SF1", dimensionIds: ["1.1.1"], derivation: null },
                { name: "l", value: "0.60", source: "cote lue, SF1", dimensionIds: ["1.1.2"], derivation: "60 cm convertis en mètres" },
                { name: "h", value: "0.40", source: "texte lu, SF1", dimensionIds: ["1.1.3"], derivation: "40 cm convertis en mètres" },
              ],
              deductions: [],
              unit: "m3",
              drawingId,
              zone: "Pourtour",
              note: null,
            },
          ],
          missing: [],
        },
      ],
      warnings: [],
    };
  },
  metre_postes: (input) => {
    // Postes à métrer : une longueur relevée pour un poste en ml, sinon la donnée manquante est dite.
    const postes = jsonAfter(input, "Postes à métrer (JSON)") as Array<{ lineId: string; designation: string; unite: string }>;
    const drawingId = drawingIdsIn(input)[0] ?? null;
    return {
      postes: postes.map((p) =>
        p.unite === "ml" && drawingId
          ? {
              lineId: p.lineId,
              measurements: [{ label: p.designation, method: "longueur", formula: "L", inputs: [{ name: "L", value: "42.50", source: "cote lue, SF1", dimensionIds: ["1.1.1"], derivation: null }], deductions: [], unit: "ml", drawingId, zone: null, note: null }],
              missing: [],
            }
          : { lineId: p.lineId, measurements: [], missing: [`${p.designation} : dimension non relevée sur les planches`] },
      ),
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

/** Tests : sortie simulée actuelle d'un schéma, pour la rétablir après l'avoir remplacée. */
export function fakeBuilder(schemaName: string): ((input: string) => unknown) | undefined {
  return builders[schemaName];
}
