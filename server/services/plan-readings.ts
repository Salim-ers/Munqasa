/**
 * Relevés de plans transmis au métreur, et enregistrement des mesures qu'il propose.
 *
 * Les relevés réunissent, pour chaque planche lue : cartouche, éléments et cotes relevées (chacune avec un
 * identifiant stable « planche.élément.cote » et son contrôle dans le texte vectoriel), chaînes de cotes
 * reconstituées par le serveur (identifiant « C planche.chaîne », somme contrôlée à l'échelle, cote totale
 * retrouvée). Le métreur cite ces identifiants ; le serveur calcule chaque quantité à partir de la formule
 * et rattache chaque entrée à ses cotes : rien n'est recopié du modèle.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { DimensionCheck, DimensionRef, MeasureDeduction, MeasureInputSource } from "../../shared/metre.js";
import { measureConfidence } from "../../shared/metre.js";
import type { MetreProposal, PlanExtraction } from "../ai/schemas.js";
import { type Database, schema } from "../db/index.js";
import { FormulaError } from "./formula.js";
import { analyseInput, computeMeasure } from "./metre.js";
import type { DimensionChain } from "./plan-text.js";

type DrawingRow = typeof schema.drawing.$inferSelect;
type ExtractedElement = PlanExtraction["elements"][number];
type StoredElement = Omit<ExtractedElement, "dimensions"> & { dimensions: Array<ExtractedElement["dimensions"][number] & { check?: DimensionCheck }>; countCheck?: DimensionCheck | null };
type StoredExtraction = Omit<PlanExtraction, "elements"> & { elements: StoredElement[] };

/** Couche texte enregistrée pour une planche : volumes, échelles écrites, chaînes de cotes. */
export interface TextLayer {
  items: number;
  numbers: number;
  scales: number[];
  chains?: DimensionChain[];
}

export interface Readings {
  readings: unknown[];
  index: Map<string, DimensionRef>;
  drawingIds: Set<string>;
}

/** Position lisible d'une chaîne sur la planche, pour que le métreur la situe sur l'image. */
function where(chain: DimensionChain, page: { width: number; height: number } | null): string {
  if (!page) return chain.orientation;
  const across = chain.orientation === "verticale" ? chain.line / page.width : chain.line / page.height;
  const side = chain.orientation === "verticale" ? (across < 0.33 ? "à gauche" : across > 0.66 ? "à droite" : "au centre") : across < 0.33 ? "en haut" : across > 0.66 ? "en bas" : "au milieu";
  return `${chain.orientation}, ${side} de la planche`;
}

/**
 * Relevés des planches données (dans l'ordre fourni : les identifiants restent stables d'une lecture à
 * l'autre), ou de toutes les planches lues de l'affaire.
 */
export async function buildReadings(db: Database, projectId: string, drawingIds?: string[]): Promise<Readings> {
  const loaded: DrawingRow[] = drawingIds
    ? drawingIds.length
      ? await db.select().from(schema.drawing).where(inArray(schema.drawing.id, drawingIds))
      : []
    : await db
        .select({ drawing: schema.drawing })
        .from(schema.drawing)
        .innerJoin(schema.sourceFile, eq(schema.sourceFile.id, schema.drawing.sourceFileId))
        .where(and(eq(schema.drawing.projectId, projectId), isNull(schema.sourceFile.deletedAt)))
        .then((rows) => rows.map((r) => r.drawing).sort((a, b) => a.sourceFileId.localeCompare(b.sourceFileId) || a.pageNumber - b.pageNumber));
  const drawings = drawingIds ? drawingIds.map((id) => loaded.find((d) => d.id === id)).filter((d): d is DrawingRow => Boolean(d)) : loaded;
  const index = new Map<string, DimensionRef>();
  const readable = drawings.filter((d) => d.extraction && (d.extraction as PlanExtraction).sheet.readable);
  const readings = readable.map((d, si) => {
    const e = d.extraction as StoredExtraction;
    const layer = (d.textLayer ?? null) as (TextLayer & { width?: number; height?: number }) | null;
    const chains = (layer?.chains ?? []).map((chain, ci) => {
      const id = `C${si + 1}.${ci + 1}`;
      // La somme se déduit des cotes écrites ; une cote totale retrouvée est, elle, écrite sur la planche.
      index.set(id, { id, drawingId: d.id, element: `Chaîne de cotes ${chain.orientation}`, name: "somme des cotes partielles", value: chain.sum, unit: "m", source: "deduit", check: "deduite" });
      if (chain.total) index.set(`${id}T`, { id: `${id}T`, drawingId: d.id, element: `Chaîne de cotes ${chain.orientation}`, name: "cote totale", value: chain.total.meters, unit: "m", source: "cote_lue", check: "couche_texte" });
      return {
        id,
        position: where(chain, layer?.width && layer.height ? { width: layer.width, height: layer.height } : null),
        cotes: chain.items.map((i) => i.text).join(" + "),
        sommeEnMetres: chain.sum,
        controle: chain.verified ? "écartements cohérents avec l’échelle de la planche" : "échelle non lue : écartements non contrôlés",
        coteTotale: chain.total ? { id: `${id}T`, valeur: chain.total.text } : null,
      };
    });
    return {
      drawingId: d.id,
      title: e.sheet.title,
      number: e.sheet.number,
      kind: e.sheet.kind,
      level: e.sheet.level,
      scale: e.sheet.scale,
      revision: e.sheet.revision ?? null,
      vectorText: Boolean(d.textLayer),
      elements: e.elements.map((el, ei) => {
        const dimensions = el.dimensions.map((dim, di) => {
          const id = `${si + 1}.${ei + 1}.${di + 1}`;
          const check: DimensionCheck = dim.check ?? (d.textLayer ? "non_retrouvee" : "sans_couche_texte");
          index.set(id, { id, drawingId: d.id, element: el.designation, name: dim.name, value: dim.value, unit: dim.unit, source: dim.source, check });
          return { id, name: dim.name, value: dim.value, unit: dim.unit, source: dim.source, check };
        });
        const countId = el.count === null ? null : `${si + 1}.${ei + 1}.n`;
        if (countId) index.set(countId, { id: countId, drawingId: d.id, element: el.designation, name: "nombre", value: String(el.count), unit: "u", source: "cote_lue", check: el.countCheck ?? "denombree" });
        return { category: el.category, designation: el.designation, location: el.location, count: el.count, countId, material: el.material, dimensions, note: el.note };
      }),
      chains,
      notes: e.notes,
    };
  });
  return { readings, index, drawingIds: new Set(drawings.map((d) => d.id)) };
}

export type ProposedMeasurement = MetreProposal["workItems"][number]["measurements"][number];

/**
 * Enregistre les mesures proposées pour un ouvrage : quantités brute, déductions et nette calculées par le
 * serveur, entrées rattachées à leurs cotes, confiance déterministe ; une formule incalculable donne une
 * mesure sans quantité (jamais zéro). Renvoie les avertissements à journaliser.
 */
export async function insertProposedMeasures(
  tx: Pick<Database, "insert">,
  params: { projectId: string; lotId: string | null; workItemId: string; code: string; measurements: ProposedMeasurement[]; readings: Readings },
): Promise<{ count: number; warnings: string[] }> {
  const warnings: string[] = [];
  let count = 0;
  for (const m of params.measurements) {
    const inputs = Object.fromEntries(m.inputs.map((i) => [i.name, i.value]));
    const inputSources: MeasureInputSource[] = m.inputs.map((i) => analyseInput(i, params.readings.index));
    const confidence = measureConfidence(inputSources);
    let result: ReturnType<typeof computeMeasure> | null = null;
    let error: string | null = null;
    try {
      result = computeMeasure(m.formula, inputs, m.deductions);
    } catch (cause) {
      error = cause instanceof FormulaError ? cause.message : "Calcul impossible.";
      warnings.push(`${params.code} « ${m.label} » : ${error}`);
    }
    const weak = inputSources.filter((s) => s.dimensions.length === 0 || s.mismatch || s.dimensions.some((d) => d.check === "non_retrouvee"));
    if (weak.length) {
      warnings.push(
        `${params.code} « ${m.label} » : confiance faible, ${weak
          .map((s) => (s.dimensions.length === 0 ? `${s.name} sans cote relevée` : s.mismatch ? `${s.name} : ${s.mismatch}` : `${s.name} : cote absente du texte vectoriel`))
          .join(", ")}.`,
      );
    }
    const sources = m.inputs.map((i) => `${i.name} = ${i.value} (${i.source})`).join(" ; ");
    const firstDrawing = inputSources.flatMap((s) => s.dimensions)[0]?.drawingId ?? null;
    await tx.insert(schema.measurement).values({
      projectId: params.projectId,
      lotId: params.lotId,
      workItemId: params.workItemId,
      drawingId: m.drawingId && params.readings.drawingIds.has(m.drawingId) ? m.drawingId : firstDrawing,
      zoneRef: m.zone,
      label: m.label,
      method: m.method,
      formula: m.formula,
      inputs,
      quantity: result?.net ?? null,
      grossQuantity: result?.gross ?? null,
      deductions: (result?.deductions ?? m.deductions.map((d) => ({ label: d.label, formula: d.formula, quantity: null }))) as MeasureDeduction[],
      inputSources,
      confidence,
      unit: m.unit,
      source: "proposition_ia",
      status: "a_verifier",
      notes: [error ? `Calcul impossible : ${error}` : null, m.note, sources ? `Sources : ${sources}` : null].filter(Boolean).join("\n"),
    });
    count++;
  }
  return { count, warnings };
}

/** Règles de métré communes au métré des plans et au métré des postes de DPGF. */
export const METRE_RULES = `Règles de calcul :
- chaque quantité est une formule simple : variables nommées (lettres, chiffres, _), opérateurs + - * / et parenthèses, sans fonction ni unité ; le serveur calcule la quantité ;
- chaque entrée vient des relevés, convertie en mètres ; « dimensionIds » liste les identifiants utilisés : cotes relevées (« id » de chaque cote, « countId » pour un nombre d'éléments) et chaînes de cotes reconstituées par le serveur (« C1.2 » pour la somme d'une chaîne, « C1.2T » pour sa cote totale écrite) ; si la valeur n'est pas la simple conversion d'une seule cote (somme, différence, moitié, produit de cotes générales…), explique le calcul dans « derivation », sinon mets « derivation » à null ; « drawingId » est l'identifiant de la planche d'origine ;
- établis une mesure dès que les cotes relevées permettent un calcul, y compris par les règles de métré usuelles, en expliquant la dérivation : surface d'emprise = longueur × largeur des cotes générales quand l'emprise dessinée est rectangulaire, périmètre = 2 × (longueur + largeur), hauteur d'étage lue sur une coupe ou par différence d'altitudes de niveaux, multiplication par le nombre de niveaux identiques lus sur les planches, nombre d'éléments identiques dénombrés ; croise plans de niveau, coupes et élévations ;
- une mesure établie à partir de cotes générales est un avant-métré : dis dans « note » les simplifications retenues (retraits non déduits, emprise supposée rectangulaire, hauteur moyenne…) ;
- les vides et déductions (baies, trémies, réservations) sont des formules distinctes dans « deductions », avec les mêmes variables, quand leurs dimensions sont relevées ; sinon signale dans « missing » la déduction non faite ;
- un même élément n'est compté qu'une fois : il n'apparaît pas dans deux ouvrages de même nature ni dans deux mesures du même ouvrage ;
- n'additionne jamais des unités différentes ; pas de quantité forfaitaire ;
- si une donnée indispensable manque (épaisseur, hauteur, longueur non cotée, pièce absente telle qu'une coupe ou un plan de fondations), ne la devine jamais : ne crée pas la mesure et liste précisément chaque donnée manquante dans « missing » (par exemple « épaisseur du dallage : ni cotée sur les coupes ni écrite sur les plans ») ;
- les cotes dont le contrôle « check » vaut « non_retrouvee » sont absentes du texte vectoriel de leur page : utilise-les seulement à défaut d'autre cote, et signale-le.`;
