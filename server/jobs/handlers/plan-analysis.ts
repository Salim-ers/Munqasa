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
import type { DimensionCheck } from "../../../shared/metre.js";
import { AiTimeoutError, aiFiles, callAgent } from "../../ai/client.js";
import { lotRuleText, lotsRuleText } from "../../ai/lot-rules.js";
import { metreProposal, type PlanExtraction, planExtraction } from "../../ai/schemas.js";
import { schema } from "../../db/index.js";
import { readPdfText, type TextItem } from "../../services/pdf-text.js";
import { buildReadings, insertProposedMeasures, METRE_RULES, type TextLayer } from "../../services/plan-readings.js";
import { checkDimension, type DimensionChain, dimensionChains, numberTokens, resolveScale, scalesIn, textExcerpt } from "../../services/plan-text.js";
import { getStorage } from "../../services/storage.js";
import { normalizeUnit } from "../../services/units.js";
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
  /** Lot du métré. */
  lotId: string | null;
  /** Lots lus sur les mêmes planches (génération du dossier sur plusieurs lots) ; sinon le lot du métré. */
  lotIds?: string[];
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

const READER_INSTRUCTIONS = `Tu es métreur-projeteur en bâtiment. Tu lis UNE page de plan et tu relèves uniquement ce qui y figure réellement, pour le ou les lots indiqués dans la demande.
Relève :
- le cartouche : titre, numéro de planche, nature du plan, niveau, échelle telle qu'écrite, indice ou révision tel qu'écrit ;
- les éléments des lots indiqués visibles sur la page, avec leurs cotes lisibles, leur nombre s'il est lisible ou indiqué, leur matériau s'il est écrit ; pour un mur, une façade, une dalle ou un ouvrage linéaire, relève les cotes qui le mesurent (longueur de façade, entraxes, épaisseur, cotes générales) quand la chaîne de cotes qui le mesure est identifiable ;
- sur les coupes et élévations, un élément « Niveaux et hauteurs » (catégorie « autre ») portant, telles qu'écrites, l'altitude de chaque niveau, la hauteur d'étage, la hauteur sous plafond, l'épaisseur des planchers et la hauteur des acrotères ;
- les notes et légendes utiles au lot.
Règles strictes :
- n'invente aucune cote, quantité ni matériau ; une dimension illisible n'est pas relevée ;
- pour chaque dimension, indique la source : « cote_lue » (cote dimensionnelle lue), « texte_lu » (inscrite dans un texte ou une légende), « deduit » (calculée par différence de cotes lues, à expliquer dans la note) ;
- exprime les valeurs avec leur unité telle qu'elle apparaît (m, cm, mm) sans conversion, en recopiant les chiffres exactement comme ils sont écrits ; sur les plans d'architecte, une cote décimale est en mètres (2.77) et une cote entière en centimètres (80) ;
- quand le texte vectoriel de la page est fourni, il reproduit exactement les textes et cotes du plan : relève les valeurs à partir de ce texte quand elles y figurent ; les chaînes de cotes reconstituées par le serveur indiquent quelles cotes se suivent sur une même ligne de cote ;
- note dans « uncertainties » tout ce qui est illisible, ambigu ou contradictoire ;
- si la page n'est pas un plan exploitable, mets « readable » à false et laisse les éléments vides.
Réponds en français.`;

const METREUR_INSTRUCTIONS = `Tu es économiste de la construction et métreur. À partir des relevés de plans fournis, établis les ouvrages du lot indiqué et leurs métrés.
- chaque ouvrage a un code (GO-01, GO-02…), une désignation précise, une unité (m3, m2, ml, u, kg), et ses caractéristiques avec leur source (planche et élément) ;
- les ouvrages déjà établis et conservés (liste fournie) restent tels quels : ne les propose pas à nouveau, et numérote les nouveaux ouvrages à la suite de leurs codes ;
- regroupe les éléments identiques (même section, même hauteur) avec une variable de nombre n ;
- un ouvrage que les relevés ne permettent pas de mesurer reste dans la liste, sans mesure, avec ses données manquantes dans « missing ».
${METRE_RULES}
Les quantités seront calculées par le serveur à partir de tes formules. Réponds en français.`;

const sameWork = (a: { designation: string; unit: string | null }, b: { designation: string; unit: string | null }) =>
  a.designation.trim().toLowerCase().replace(/\s+/g, " ") === b.designation.trim().toLowerCase().replace(/\s+/g, " ") && normalizeUnit(a.unit) === normalizeUnit(b.unit);

/** Code libre le plus proche : même préfixe, numéro suivant le plus grand déjà pris (GO-01 pris : GO-03 si GO-02 l'est aussi). */
export function nextFreeCode(code: string, used: Set<string>): string {
  if (!used.has(code)) return code;
  const match = /^(.*?)(\d+)$/.exec(code);
  if (!match) {
    let n = 2;
    while (used.has(`${code}-${n}`)) n++;
    return `${code}-${n}`;
  }
  const [, prefix, digits] = match as unknown as [string, string, string];
  const taken = [...used].map((c) => (c.startsWith(prefix) && /^\d+$/.test(c.slice(prefix.length)) ? Number(c.slice(prefix.length)) : 0));
  let n = Math.max(Number(digits), ...taken) + 1;
  while (used.has(`${prefix}${String(n).padStart(digits.length, "0")}`)) n++;
  return `${prefix}${String(n).padStart(digits.length, "0")}`;
}

/** Chaînes de cotes d'une page, résumées pour le lecteur. */
function chainsText(chains: DimensionChain[]): string {
  return chains
    .slice(0, 40)
    .map((c) => `${c.orientation} (ligne ${Math.round(c.line)}) : ${c.items.map((i) => i.text).join(" + ")} = ${c.sum} m${c.total ? `, cote totale ${c.total.text}` : ""}`)
    .join("\n");
}

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
      let pageSize: { width: number; height: number } | null = null;
      if (file.mimeType === "application/pdf") {
        try {
          const [page] = await readPdfText(bytes, { pages: [drawing.pageNumber] });
          textItems = page && page.items.length ? page.items : null;
          pageSize = page ? { width: page.width, height: page.height } : null;
        } catch {
          textItems = null;
        }
      }
      const numbers = textItems ? numberTokens(textItems) : null;
      const textScales = textItems ? scalesIn(textItems.map((i) => i.text).join("  ")) : [];
      // Chaînes de cotes reconstituées à l'échelle écrite sur la page (sans échelle unique, écartements non contrôlés).
      const chains = textItems ? dimensionChains(textItems, textScales.length === 1 ? textScales[0]! : null) : [];
      const lotIds = input.lotIds?.length ? input.lotIds : input.lotId ? [input.lotId] : [];
      const lots = lotIds.length ? await db.select({ tradeFamily: schema.projectLot.tradeFamily }).from(schema.projectLot).where(inArray(schema.projectLot.id, lotIds)) : [];
      const label = `Planche : ${file.originalName}, page ${drawing.pageNumber}${file.pageCount ? ` sur ${file.pageCount}` : ""}. Relève son contenu selon les règles.\n${lots.length > 1 ? lotsRuleText(lots.map((l) => l.tradeFamily)) : lotRuleText(lots[0]?.tradeFamily)}`;
      const prompt = textItems
        ? `${label}\n\nTexte vectoriel exact de la page, extrait du PDF :\n${textExcerpt(textItems)}${chains.length ? `\n\nChaînes de cotes reconstituées par le serveur (cotes qui se suivent sur une même ligne de cote) :\n${chainsText(chains)}` : ""}`
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
        let extraction: PlanExtraction;
        try {
          extraction = await callAgent({
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
        } catch (error) {
          // Page trop dense pour être lue dans le temps d'une exécution, même avec un raisonnement raccourci :
          // elle est écartée et dite, la lecture continue avec les autres pages.
          if (error instanceof AiTimeoutError && ctx.step.attempts >= 1) {
            await ctx.log(`${file.originalName} p.${drawing.pageNumber} : page non lue, le modèle n’a pas répondu dans le temps disponible malgré un second essai. Relancez la lecture de cette page seule, ou exportez-la à part.`);
            return { result: { drawingId, skipped: true, timeout: true } };
          }
          throw error;
        }
        // Contrôle de chaque cote relevée dans le texte vectoriel de la page.
        const elements: CheckedElement[] = extraction.elements.map((e) => ({
          ...e,
          dimensions: e.dimensions.map((d) => ({ ...d, check: checkDimension(d.value, d.source, numbers) })),
          countCheck: e.count === null ? null : numbers?.has(String(e.count)) ? "couche_texte" : "denombree",
        }));
        const dims = elements.flatMap((e) => e.dimensions.map((d) => ({ element: e.designation, dimension: d.name, value: d.value, unit: d.unit, check: d.check })));
        const scale = resolveScale(textScales, extraction.sheet.scale);
        // Échelle retenue grâce au cartouche quand la page en porte plusieurs : chaînes recalculées à cette échelle.
        const verifiedChains = textItems && scale.ratio !== null && textScales.length !== 1 ? dimensionChains(textItems, scale.ratio) : chains;
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
            textLayer: textItems ? ({ items: textItems.length, numbers: numbers!.size, scales: textScales, chains: verifiedChains, ...(pageSize ?? {}) } satisfies TextLayer & Partial<{ width: number; height: number }>) : null,
            status: "a_verifier",
          })
          .where(eq(schema.drawing.id, drawingId));
        const where = `${file.originalName} p.${drawing.pageNumber}`;
        if (!extraction.sheet.readable) await ctx.log(`${where} : page non exploitable.`);
        else if (textItems) {
          const totals = verifiedChains.filter((c) => c.total).length;
          await ctx.log(
            `${where} : ${stored.verification.found} cote(s) sur ${stored.verification.dimensions} retrouvée(s) dans le texte vectoriel, ${scale.reason}${verifiedChains.length ? `, ${verifiedChains.length} chaîne(s) de cotes reconstituée(s)${totals ? ` dont ${totals} vérifiée(s) par leur cote totale` : ""}` : ""}.`,
          );
        }
        else await ctx.log(`${where} : page sans texte vectoriel, cotes lues sur l’image seulement.`);
        return { result: { drawingId, elements: extraction.elements.length, readable: extraction.sheet.readable, found: stored.verification.found, notFound: stored.verification.notFound.length } };
      } finally {
        if (uploaded) await files.deleteFile(uploaded);
      }
    }

    if (name === "metre") {
      const prepared = (ctx.results.get("preparation") ?? { drawingIds: [] }) as { drawingIds: string[] };
      // Ordre des pages préparées : les identifiants des cotes restent stables d'une lecture à l'autre.
      const readingsData = await buildReadings(db, projectId, prepared.drawingIds);
      const { readings } = readingsData;
      if (readings.length === 0) {
        await ctx.log("Aucun relevé exploitable : métré non établi.");
        return { result: { workItems: 0, measurements: 0, warnings: ["Aucun relevé exploitable."] } };
      }

      const lots = await db.select().from(schema.projectLot).where(eq(schema.projectLot.projectId, projectId));
      const lot = lots.find((l) => l.id === input.lotId) ?? lots.find((l) => l.tradeFamily === "gros_oeuvre") ?? null;
      // Ouvrages conservés : saisis, ou proposés puis vérifiés. Ils gardent leur identifiant et leurs mesures :
      // le métreur ne les propose pas une seconde fois, avec une autre quantité.
      const lotItems = await db
        .select()
        .from(schema.workItem)
        .where(and(eq(schema.workItem.projectId, projectId), lot ? eq(schema.workItem.lotId, lot.id) : isNull(schema.workItem.lotId)));
      const verified = lotItems.length
        ? await db
            .selectDistinct({ workItemId: schema.measurement.workItemId })
            .from(schema.measurement)
            .where(and(inArray(schema.measurement.workItemId, lotItems.map((i) => i.id)), eq(schema.measurement.status, "verifie")))
        : [];
      const kept = lotItems.filter((i) => i.origin !== "proposition_ia" || verified.some((v) => v.workItemId === i.id));
      const keptText = kept.length ? `\nOuvrages déjà établis et conservés (JSON) :\n${JSON.stringify(kept.map((i) => ({ code: i.code, designation: i.designation, unite: i.unit })))}` : "";
      const proposal = await callAgent({
        agent: "metreur",
        role: "generation",
        projectId,
        jobId: ctx.job.id,
        instructions: METREUR_INSTRUCTIONS,
        input: `Lot : ${lot ? `${lot.code} ${lot.name}` : "gros œuvre"}.\n${lotRuleText(lot?.tradeFamily)}${keptText}\nRelevés des planches (JSON) :\n${JSON.stringify(readings)}`,
        schema: metreProposal,
        schemaName: "metre",
        summary: `Métré à partir de ${readings.length} planche(s)`,
        maxOutputTokens: 20_000,
        effort: "medium",
      });

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

        // Codes déjà pris dans l'affaire (ouvrages conservés, autres lots) : un nouveau code ne les reprend jamais.
        const used = new Set((await tx.select({ code: schema.workItem.code }).from(schema.workItem).where(eq(schema.workItem.projectId, projectId))).map((w) => w.code).filter((c): c is string => Boolean(c)));
        for (const item of proposal.workItems) {
          const existing = kept.find((k) => sameWork(k, item));
          if (existing) {
            warnings.push(`${existing.code ?? item.code} ${existing.designation} : ouvrage déjà établi, conservé avec ses mesures, non proposé une seconde fois.`);
            continue;
          }
          const code = nextFreeCode(item.code, used);
          used.add(code);
          if (code !== item.code) warnings.push(`${item.code} déjà pris dans l’affaire : nouvel ouvrage numéroté ${code}.`);
          item.code = code;
          const missing = item.missing.map((m) => m.trim()).filter(Boolean).slice(0, 12);
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
              missingData: missing,
              origin: "proposition_ia",
              jobId: ctx.job.id,
            })
            .returning({ id: schema.workItem.id });
          const inserted = await insertProposedMeasures(tx, { projectId, lotId: lot?.id ?? null, workItemId: created!.id, code: item.code, measurements: item.measurements, readings: readingsData });
          measurementCount += inserted.count;
          warnings.push(...inserted.warnings);
          if (item.measurements.length === 0 && missing.length) warnings.push(`${item.code} non mesuré : ${missing.join(" ; ")}`);
        }
      });
      for (const w of warnings.slice(0, 30)) await ctx.log(w);
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
