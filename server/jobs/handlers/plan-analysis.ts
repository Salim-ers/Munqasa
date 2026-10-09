/**
 * Agent « Lecture des plans et métré » :
 * 1. préparation : pages à lire (PDF découpé page par page, images) ;
 * 2. une étape par page : relevé structuré (cartouche, éléments de gros œuvre, cotes lisibles) ;
 * 3. métré : ouvrages et mesures proposés, quantités calculées par le serveur à partir des cotes relevées.
 * Rien n'est inventé : une cote illisible n'est pas relevée, une entrée manquante empêche la mesure.
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { aiFiles, callAgent } from "../../ai/client.js";
import { metreProposal, type PlanExtraction, planExtraction } from "../../ai/schemas.js";
import { schema } from "../../db/index.js";
import { evaluateFormula, FormulaError } from "../../services/formula.js";
import { getStorage } from "../../services/storage.js";
import { type JobHandler, RetriableStepError } from "../types.js";

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

const READER_INSTRUCTIONS = `Tu es métreur-projeteur en bâtiment, spécialiste du gros œuvre. Tu lis UNE page de plan et tu relèves uniquement ce qui y figure réellement.
Relève :
- le cartouche : titre, numéro de planche, nature du plan, niveau, échelle telle qu'écrite ;
- les éléments de gros œuvre visibles (terrassements, fondations, longrines, dallages, voiles, murs, poteaux, poutres, dalles, escaliers, acrotères, ouvertures dans les éléments porteurs, réseaux enterrés) avec leurs cotes lisibles, leur nombre s'il est lisible ou indiqué, leur matériau s'il est écrit ;
- les notes et légendes utiles au gros œuvre.
Règles strictes :
- n'invente aucune cote, quantité ni matériau ; une dimension illisible n'est pas relevée ;
- pour chaque dimension, indique la source : « cote_lue » (cote dimensionnelle lue), « texte_lu » (inscrite dans un texte ou une légende), « deduit » (calculée par différence de cotes lues, à expliquer dans la note) ;
- exprime les valeurs avec leur unité telle qu'elle apparaît (m, cm, mm) sans conversion ;
- note dans « uncertainties » tout ce qui est illisible, ambigu ou contradictoire ;
- si la page n'est pas un plan exploitable, mets « readable » à false et laisse les éléments vides.
Réponds en français.`;

const METREUR_INSTRUCTIONS = `Tu es économiste de la construction. À partir des relevés de plans fournis, établis les ouvrages du lot indiqué et leurs métrés.
Règles strictes :
- chaque ouvrage a un code (GO-01, GO-02…), une désignation précise, une unité (m3, m2, ml, u, kg), et ses caractéristiques avec leur source (planche et élément) ;
- chaque quantité est une formule simple : variables nommées (lettres, chiffres, _), opérateurs + - * / et parenthèses, sans fonction ni unité ;
- chaque entrée de la formule vient des relevés (cote lue, texte lu ou déduite par différence de cotes), convertie en mètres, avec sa source ; « drawingId » est l'identifiant de la planche d'origine fourni dans les relevés ;
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
      const prompt = `Planche : ${file.originalName}, page ${drawing.pageNumber}${file.pageCount ? ` sur ${file.pageCount}` : ""}. Relève son contenu selon les règles.`;
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
          summary: prompt,
          maxOutputTokens: 12_000,
          effort: "medium",
        });
        await db
          .update(schema.drawing)
          .set({
            extraction,
            title: extraction.sheet.title,
            sheetNumber: extraction.sheet.number,
            kind: extraction.sheet.kind,
            level: extraction.sheet.level,
            scaleText: extraction.sheet.scale,
            status: "a_verifier",
          })
          .where(eq(schema.drawing.id, drawingId));
        if (!extraction.sheet.readable) await ctx.log(`${file.originalName} p.${drawing.pageNumber} : page non exploitable.`);
        return { result: { drawingId, elements: extraction.elements.length, readable: extraction.sheet.readable } };
      } finally {
        if (uploaded) await files.deleteFile(uploaded);
      }
    }

    if (name === "metre") {
      const prepared = (ctx.results.get("preparation") ?? { drawingIds: [] }) as { drawingIds: string[] };
      const drawings: DrawingRow[] = prepared.drawingIds.length
        ? await db.select().from(schema.drawing).where(inArray(schema.drawing.id, prepared.drawingIds))
        : [];
      const readings = drawings
        .filter((d) => d.extraction && (d.extraction as PlanExtraction).sheet.readable)
        .map((d) => {
          const e = d.extraction as PlanExtraction;
          return { drawingId: d.id, title: e.sheet.title, number: e.sheet.number, kind: e.sheet.kind, level: e.sheet.level, scale: e.sheet.scale, elements: e.elements, notes: e.notes };
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
        input: `Lot : ${lot ? `${lot.code} ${lot.name}` : "gros œuvre"}.\nRelevés des planches (JSON) :\n${JSON.stringify(readings)}`,
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
            let quantity: string | null = null;
            let error: string | null = null;
            try {
              quantity = evaluateFormula(m.formula, inputs);
            } catch (cause) {
              error = cause instanceof FormulaError ? cause.message : "Calcul impossible.";
              warnings.push(`${item.code} « ${m.label} » : ${error}`);
            }
            const sources = m.inputs.map((i) => `${i.name} = ${i.value} (${i.source})`).join(" ; ");
            await tx.insert(schema.measurement).values({
              projectId,
              lotId: lot?.id ?? null,
              workItemId: created!.id,
              drawingId: m.drawingId && validDrawings.has(m.drawingId) ? m.drawingId : null,
              zoneRef: m.zone,
              label: m.label,
              method: m.method,
              formula: m.formula,
              inputs,
              quantity,
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
