/**
 * Agent « Lecture des plans et métré » :
 * 1. préparation : pages à lire (PDF découpé page par page, images) ;
 * 2. une étape par page : texte vectoriel du PDF lu par le serveur (plans issus de la CAO), relevé structuré
 *    par l'agent (cartouche, indice, éléments, cotes lisibles), puis contrôle de chaque cote relevée dans ce
 *    texte vectoriel, échelle lue telle qu'écrite ;
 * 3. métré : ouvrages et mesures proposés, chaque entrée citant les cotes relevées dont elle vient ;
 *    quantités brutes, déductions et quantités nettes calculées par le serveur ; confiance déterministe.
 * Rien n'est inventé : une cote illisible n'est pas relevée, une entrée manquante empêche la mesure.
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { type DimensionCheck, type DimensionRef, measureConfidence } from "../../../shared/metre.js";
import { aiFiles, callAgent } from "../../ai/client.js";
import { lotRuleText } from "../../ai/lot-rules.js";
import { metreProposal, type PlanExtraction, planExtraction } from "../../ai/schemas.js";
import { schema } from "../../db/index.js";
import { FormulaError } from "../../services/formula.js";
import { analyseInput, computeMeasure } from "../../services/metre.js";
import { readPdfText, type TextItem } from "../../services/pdf-text.js";
import { checkDimension, numberTokens, resolveScale, scalesIn, textExcerpt } from "../../services/plan-text.js";
import { getStorage } from "../../services/storage.js";
import { type JobHandler, RetriableStepError } from "../types.js";

/** Relevé enregistré : celui de l'agent, complété par le contrôle de chaque cote dans le texte vectoriel. */
type ExtractedElement = PlanExtraction["elements"][number];
type CheckedElement = Omit<ExtractedElement, "dimensions"> & {
  dimensions: Array<ExtractedElement["dimensions"][number] & { check: DimensionCheck }>;
  countCheck: DimensionCheck | null;
};
export type StoredExtraction = Omit<PlanExtraction, "elements"> & {
  elements: CheckedElement[];
  verification: { textItems: number; dimensions: number; found: number; notFound: Array<{ element: string; dimension: string; value: string; unit: string }>; scale: string };
};

/** Au-delà, un fichier n'est pas transmis à l'analyse (limite de l'API et de la mémoire). */
const MAX_FILE_BYTES = 50 * 1024 * 1024;
/** Nombre maximal de pages lues par traitement. */
const MAX_PAGES = 80;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

export interface PlanAnalysisInput {
  fileIds: string[];
  lotId: string | null;
}

/** Dernier fichier lu, gardé le temps d'une invocation (les pages d'un même PDF se suivent). */
let cache: { key: string; bytes: Uint8Array } | null = null;

async function readFile(storageKey: string): Promise<Uint8Array> {
  if (cache?.key === storageKey) return cache.bytes;
  const storage = await getStorage();
  const head = await storage.head(storageKey);
  if (!head) throw new Error("Fichier introuvable dans le stockage.");
  if (head.size > MAX_FILE_BYTES) throw new Error("Fichier trop volumineux pour l’analyse (50 Mo au plus).");
  let stream: ReadableStream<Uint8Array>;
  try {
    stream = await storage.readStream(storageKey);
  } catch (error) {
    throw new RetriableStepError(`Lecture du stockage impossible : ${(error as Error).message}`);
  }
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const bytes = new Uint8Array(Buffer.concat(chunks));
  cache = { key: storageKey, bytes };
  return bytes;
}

class UnreadableFileError extends Error {}

/** PDF chargé et vérifié (une erreur de structure peut n'apparaître qu'à la lecture des pages). */
async function loadPdf(bytes: Uint8Array): Promise<PDFDocument> {
  try {
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    if (pdf.getPageCount() < 1) throw new Error("vide");
    return pdf;
  } catch {
    throw new UnreadableFileError("PDF illisible (protégé ou endommagé) : exportez-le de nouveau.");
  }
}

const READER_INSTRUCTIONS = `Tu es métreur-projeteur en bâtiment. Tu lis UNE page de plan et tu relèves uniquement ce qui y figure réellement, pour le lot indiqué dans la demande.
Relève :
- le cartouche : titre, numéro de planche, nature du plan, niveau, échelle telle qu'écrite, indice ou révision tel qu'écrit ;
- les éléments du lot visibles sur la page, avec leurs cotes lisibles, leur nombre s'il est lisible ou indiqué, leur matériau s'il est écrit ;
- les notes et légendes utiles au lot.
Règles strictes :
- n'invente aucune cote, quantité ni matériau ; une dimension illisible n'est pas relevée ;
- pour chaque dimension, indique la source : « cote_lue » (cote dimensionnelle lue), « texte_lu » (inscrite dans un texte ou une légende), « deduit » (calculée par différence de cotes lues, à expliquer dans la note) ;
- exprime les valeurs avec leur unité telle qu'elle apparaît (m, cm, mm) sans conversion, en recopiant les chiffres exactement comme ils sont écrits ;
- quand le texte vectoriel de la page est fourni, il reproduit exactement les textes et cotes du plan : relève les valeurs à partir de ce texte quand elles y figurent ;
- note dans « uncertainties » tout ce qui est illisible, ambigu ou contradictoire ;
- si la page n'est pas un plan exploitable, mets « readable » à false et laisse les éléments vides.
Réponds en français.`;

const METREUR_INSTRUCTIONS = `Tu es économiste de la construction. À partir des relevés de plans fournis, établis les ouvrages du lot indiqué et leurs métrés.
Règles strictes :
- chaque ouvrage a un code (GO-01, GO-02…), une désignation précise, une unité (m3, m2, ml, u, kg), et ses caractéristiques avec leur source (planche et élément) ;
- chaque quantité est une formule simple : variables nommées (lettres, chiffres, _), opérateurs + - * / et parenthèses, sans fonction ni unité ;
- chaque entrée de la formule vient des relevés, convertie en mètres ; « dimensionIds » liste les identifiants des cotes relevées utilisées (« id » de chaque cote, « countId » pour un nombre d'éléments) ; si la valeur n'est pas la simple conversion d'une seule cote (somme, différence, moitié…), explique le calcul dans « derivation », sinon mets « derivation » à null ; « drawingId » est l'identifiant de la planche d'origine ;
- les cotes dont le contrôle « check » vaut « non_retrouvee » sont absentes du texte vectoriel de leur page : utilise-les seulement à défaut d'autre cote, et signale-le dans « warnings » ;
- les vides et déductions (ouvertures, trémies, réservations) sont des formules distinctes dans « deductions », avec les mêmes variables ; la formule principale donne la quantité brute ;
- si une entrée manque, ne la devine pas : ne crée pas la mesure et explique le manque dans « warnings » ;
- regroupe les éléments identiques (même section, même hauteur) avec une variable de nombre n ;
- n'additionne jamais des unités différentes ; pas de quantité forfaitaire.
Les quantités seront calculées par le serveur à partir de tes formules. Réponds en français.`;

type DrawingRow = typeof schema.drawing.$inferSelect;

export const planAnalysisHandler: JobHandler = {
  kind: "analyse_plans",
  title: () => "Lecture des plans et métré",
  stepLabel(name) {
    if (name === "preparation") return "Préparation des pages";
    if (name === "metre") return "Métré des ouvrages";
    if (name.startsWith("page:")) return "Lecture d’une page";
    return name;
  },
  initialSteps: () => ["preparation", "metre"],

  async run(name, ctx) {
    const input = ctx.input as unknown as PlanAnalysisInput;
    const projectId = ctx.job.projectId!;
    const { db } = ctx;

    if (name === "preparation") {
      const files = await db
        .select()
        .from(schema.sourceFile)
        .where(and(inArray(schema.sourceFile.id, input.fileIds), eq(schema.sourceFile.projectId, projectId), isNull(schema.sourceFile.deletedAt)));
      const drawingIds: string[] = [];
      const skipped: Array<{ file: string; reason: string }> = [];
      for (const file of files) {
        if (file.status !== "verifie" && file.status !== "traite") {
          skipped.push({ file: file.originalName, reason: "fichier non vérifié" });
          continue;
        }
        let pages = 0;
        if (file.mimeType === "application/pdf") {
          // Un fichier illisible est écarté, la lecture continue avec les autres.
          try {
            const pdf = await loadPdf(await readFile(file.storageKey));
            pages = pdf.getPageCount();
          } catch (error) {
            if (error instanceof RetriableStepError) throw error;
            skipped.push({ file: file.originalName, reason: error instanceof Error ? error.message : "fichier illisible" });
            continue;
          }
          await db.update(schema.sourceFile).set({ pageCount: pages }).where(eq(schema.sourceFile.id, file.id));
        } else if (IMAGE_TYPES.includes(file.mimeType)) {
          pages = 1;
        } else {
          skipped.push({ file: file.originalName, reason: "format non lisible par l’analyse : exportez le plan en PDF" });
          continue;
        }
        const room = MAX_PAGES - drawingIds.length;
        if (room <= 0) {
          skipped.push({ file: file.originalName, reason: `limite de ${MAX_PAGES} pages atteinte` });
          continue;
        }
        if (pages > room) skipped.push({ file: file.originalName, reason: `seules les ${room} premières pages sont lues` });
        const values = Array.from({ length: Math.min(pages, room) }, (_, i) => ({ projectId, sourceFileId: file.id, pageNumber: i + 1 }));
        await db.insert(schema.drawing).values(values).onConflictDoNothing();
        const rows = await db
          .select({ id: schema.drawing.id, page: schema.drawing.pageNumber })
          .from(schema.drawing)
          .where(eq(schema.drawing.sourceFileId, file.id));
        drawingIds.push(...rows.filter((r) => r.page <= values.length).sort((a, b) => a.page - b.page).map((r) => r.id));
      }
      for (const s of skipped) await ctx.log(`${s.file} : ${s.reason}`);
      if (drawingIds.length === 0) await ctx.log("Aucune page lisible : le métré ne pourra pas être établi.");
      return { result: { drawingIds, skipped }, addSteps: drawingIds.map((id) => `page:${id}`) };
    }

    if (name.startsWith("page:")) {
      const drawingId = name.slice("page:".length);
      const [row] = await db
        .select({ drawing: schema.drawing, file: schema.sourceFile })
        .from(schema.drawing)
        .innerJoin(schema.sourceFile, eq(schema.sourceFile.id, schema.drawing.sourceFileId))
        .where(eq(schema.drawing.id, drawingId));
      if (!row) return { result: { skipped: true } };
      const { drawing, file } = row;
      const bytes = await readFile(file.storageKey);
      const files = await aiFiles();
      // Texte vectoriel de la page : absent d'un plan scanné, illisible pour certains PDF.
      let textItems: TextItem[] | null = null;
      if (file.mimeType === "application/pdf") {
        try {
          const [page] = await readPdfText(bytes, { pages: [drawing.pageNumber] });
          textItems = page && page.items.length ? page.items : null;
        } catch {
          textItems = null;
        }
      }
      const numbers = textItems ? numberTokens(textItems) : null;
      const textScales = textItems ? scalesIn(textItems.map((i) => i.text).join("  ")) : [];
      const lots = input.lotId ? await db.select({ tradeFamily: schema.projectLot.tradeFamily }).from(schema.projectLot).where(eq(schema.projectLot.id, input.lotId)) : [];
      const label = `Planche : ${file.originalName}, page ${drawing.pageNumber}${file.pageCount ? ` sur ${file.pageCount}` : ""}. Relève son contenu selon les règles.\n${lotRuleText(lots[0]?.tradeFamily)}`;
      const prompt = textItems
        ? `${label}\n\nTexte vectoriel exact de la page, extrait du PDF :\n${textExcerpt(textItems)}`
        : `${label}\n\nCette page n’a pas de texte vectoriel (plan scanné ou image) : lis les cotes sur l’image et signale toute lecture incertaine.`;
      let uploaded: string | null = null;
      try {
        let content: Array<Record<string, unknown>>;
        if (file.mimeType === "application/pdf") {
          let pageBytes: Uint8Array;
          try {
            const source = await loadPdf(bytes);
            const single = await PDFDocument.create();
            const [page] = await single.copyPages(source, [drawing.pageNumber - 1]);
            single.addPage(page!);
            pageBytes = await single.save();
          } catch {
            // Page impossible à extraire : écartée, sans arrêter la lecture des autres pages.
            await ctx.log(`${file.originalName} p.${drawing.pageNumber} : page illisible, écartée.`);
            return { result: { drawingId, skipped: true } };
          }
          uploaded = await files.uploadFile(pageBytes, `${file.originalName.replace(/\.pdf$/i, "")}-p${drawing.pageNumber}.pdf`);
          content = [
            { type: "input_file", file_id: uploaded },
            { type: "input_text", text: prompt },
          ];
        } else {
          content = [
            { type: "input_image", image_url: `data:${file.mimeType};base64,${Buffer.from(bytes).toString("base64")}`, detail: "high" },
            { type: "input_text", text: prompt },
          ];
        }
        const extraction = await callAgent({
          agent: "lecteur_plans",
          role: "extraction",
          projectId,
          jobId: ctx.job.id,
          instructions: READER_INSTRUCTIONS,
          input: [{ role: "user", content }] as never,
          schema: planExtraction,
          schemaName: "releve_plan",
          summary: label,
          maxOutputTokens: 12_000,
          effort: "medium",
        });
        // Contrôle de chaque cote relevée dans le texte vectoriel de la page.
        const elements: CheckedElement[] = extraction.elements.map((e) => ({
          ...e,
          dimensions: e.dimensions.map((d) => ({ ...d, check: checkDimension(d.value, d.source, numbers) })),
          countCheck: e.count === null ? null : numbers?.has(String(e.count)) ? "couche_texte" : "denombree",
        }));
        const dims = elements.flatMap((e) => e.dimensions.map((d) => ({ element: e.designation, dimension: d.name, value: d.value, unit: d.unit, check: d.check })));
        const scale = resolveScale(textScales, extraction.sheet.scale);
        const stored: StoredExtraction = {
          ...extraction,
          elements,
          verification: {
            textItems: textItems?.length ?? 0,
            dimensions: dims.filter((d) => d.check !== "deduite").length,
            found: dims.filter((d) => d.check === "couche_texte").length,
            notFound: dims.filter((d) => d.check === "non_retrouvee").map(({ element, dimension, value, unit }) => ({ element, dimension, value, unit })),
            scale: scale.reason,
          },
        };
        await db
          .update(schema.drawing)
          .set({
            extraction: stored,
            title: extraction.sheet.title,
            sheetNumber: extraction.sheet.number,
            kind: extraction.sheet.kind,
            level: extraction.sheet.level,
            scaleText: extraction.sheet.scale,
            revision: extraction.sheet.revision,
            scaleRatio: scale.ratio !== null ? String(scale.ratio) : null,
            textLayer: textItems ? { items: textItems.length, numbers: numbers!.size, scales: textScales } : null,
            status: "a_verifier",
          })
          .where(eq(schema.drawing.id, drawingId));
        const where = `${file.originalName} p.${drawing.pageNumber}`;
        if (!extraction.sheet.readable) await ctx.log(`${where} : page non exploitable.`);
        else if (textItems) await ctx.log(`${where} : ${stored.verification.found} cote(s) sur ${stored.verification.dimensions} retrouvée(s) dans le texte vectoriel, ${scale.reason}.`);
        else await ctx.log(`${where} : page sans texte vectoriel, cotes lues sur l’image seulement.`);
        return { result: { drawingId, elements: extraction.elements.length, readable: extraction.sheet.readable, found: stored.verification.found, notFound: stored.verification.notFound.length } };
      } finally {
        if (uploaded) await files.deleteFile(uploaded);
      }
    }

    if (name === "metre") {
      const prepared = (ctx.results.get("preparation") ?? { drawingIds: [] }) as { drawingIds: string[] };
      const loaded: DrawingRow[] = prepared.drawingIds.length
        ? await db.select().from(schema.drawing).where(inArray(schema.drawing.id, prepared.drawingIds))
        : [];
      // Ordre des pages préparées : les identifiants des cotes restent stables d'une lecture à l'autre.
      const drawings = prepared.drawingIds.map((id) => loaded.find((d) => d.id === id)).filter((d): d is DrawingRow => Boolean(d));
      const index = new Map<string, DimensionRef>();
      const readings = drawings
        .filter((d) => d.extraction && (d.extraction as PlanExtraction).sheet.readable)
        .map((d, si) => {
          const e = d.extraction as StoredExtraction;
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
            notes: e.notes,
          };
        });
      if (readings.length === 0) {
        await ctx.log("Aucun relevé exploitable : métré non établi.");
        return { result: { workItems: 0, measurements: 0, warnings: ["Aucun relevé exploitable."] } };
      }

      const lots = await db.select().from(schema.projectLot).where(eq(schema.projectLot.projectId, projectId));
      const lot = lots.find((l) => l.id === input.lotId) ?? lots.find((l) => l.tradeFamily === "gros_oeuvre") ?? null;
      const proposal = await callAgent({
        agent: "metreur",
        role: "generation",
        projectId,
        jobId: ctx.job.id,
        instructions: METREUR_INSTRUCTIONS,
        input: `Lot : ${lot ? `${lot.code} ${lot.name}` : "gros œuvre"}.\n${lotRuleText(lot?.tradeFamily)}\nRelevés des planches (JSON) :\n${JSON.stringify(readings)}`,
        schema: metreProposal,
        schemaName: "metre",
        summary: `Métré à partir de ${readings.length} planche(s)`,
        maxOutputTokens: 20_000,
        effort: "medium",
      });

      const validDrawings = new Set(drawings.map((d) => d.id));
      let measurementCount = 0;
      const warnings = [...proposal.warnings];
      await db.transaction(async (tx) => {
        // Les propositions précédentes encore non validées sont remplacées ; ce qui a été validé reste.
        const previous = await tx
          .select({ id: schema.workItem.id })
          .from(schema.workItem)
          .where(and(eq(schema.workItem.projectId, projectId), eq(schema.workItem.origin, "proposition_ia"), lot ? eq(schema.workItem.lotId, lot.id) : isNull(schema.workItem.lotId)));
        for (const { id } of previous) {
          const [validated] = await tx
            .select({ n: sql<number>`count(*)::int` })
            .from(schema.measurement)
            .where(and(eq(schema.measurement.workItemId, id), eq(schema.measurement.status, "verifie")));
          if (Number(validated?.n ?? 0) === 0) await tx.delete(schema.workItem).where(eq(schema.workItem.id, id));
        }
        await tx
          .delete(schema.measurement)
          .where(and(eq(schema.measurement.projectId, projectId), eq(schema.measurement.source, "proposition_ia"), eq(schema.measurement.status, "a_verifier"), isNull(schema.measurement.workItemId)));

        for (const item of proposal.workItems) {
          const [created] = await tx
            .insert(schema.workItem)
            .values({
              projectId,
              lotId: lot?.id ?? null,
              code: item.code,
              designation: item.designation,
              unit: item.unit,
              location: item.location,
              attributes: item.attributes,
              origin: "proposition_ia",
              jobId: ctx.job.id,
            })
            .returning({ id: schema.workItem.id });
          for (const m of item.measurements) {
            const inputs = Object.fromEntries(m.inputs.map((i) => [i.name, i.value]));
            const inputSources = m.inputs.map((i) => analyseInput(i, index));
            const confidence = measureConfidence(inputSources);
            let result: ReturnType<typeof computeMeasure> | null = null;
            let error: string | null = null;
            try {
              result = computeMeasure(m.formula, inputs, m.deductions);
            } catch (cause) {
              error = cause instanceof FormulaError ? cause.message : "Calcul impossible.";
              warnings.push(`${item.code} « ${m.label} » : ${error}`);
            }
            const weak = inputSources.filter((s) => s.dimensions.length === 0 || s.mismatch || s.dimensions.some((d) => d.check === "non_retrouvee"));
            if (weak.length) {
              warnings.push(
                `${item.code} « ${m.label} » : confiance faible, ${weak
                  .map((s) => (s.dimensions.length === 0 ? `${s.name} sans cote relevée` : s.mismatch ? `${s.name} : ${s.mismatch}` : `${s.name} : cote absente du texte vectoriel`))
                  .join(", ")}.`,
              );
            }
            const sources = m.inputs.map((i) => `${i.name} = ${i.value} (${i.source})`).join(" ; ");
            const firstDrawing = inputSources.flatMap((s) => s.dimensions)[0]?.drawingId ?? null;
            await tx.insert(schema.measurement).values({
              projectId,
              lotId: lot?.id ?? null,
              workItemId: created!.id,
              drawingId: m.drawingId && validDrawings.has(m.drawingId) ? m.drawingId : firstDrawing,
              zoneRef: m.zone,
              label: m.label,
              method: m.method,
              formula: m.formula,
              inputs,
              quantity: result?.net ?? null,
              grossQuantity: result?.gross ?? null,
              deductions: result?.deductions ?? m.deductions.map((d) => ({ label: d.label, formula: d.formula, quantity: null })),
              inputSources,
              confidence,
              unit: m.unit,
              source: "proposition_ia",
              status: "a_verifier",
              notes: [error ? `Calcul impossible : ${error}` : null, m.note, sources ? `Sources : ${sources}` : null].filter(Boolean).join("\n"),
            });
            measurementCount++;
          }
        }
      });
      for (const w of warnings.slice(0, 20)) await ctx.log(w);
      return { result: { workItems: proposal.workItems.length, measurements: measurementCount, warnings } };
    }
    return {};
  },

  async finished(job, db) {
    const [metre] = await db
      .select({ result: schema.generationStep.result })
      .from(schema.generationStep)
      .where(and(eq(schema.generationStep.jobId, job.id), eq(schema.generationStep.name, "metre")));
    const r = (metre?.result ?? {}) as { workItems?: number; measurements?: number };
    return {
      title: `Lecture des plans terminée : ${r.workItems ?? 0} ouvrage(s), ${r.measurements ?? 0} métré(s) à vérifier`,
      link: job.projectId ? `/administration/affaires/${job.projectId}?onglet=metre` : null,
    };
  },
};
