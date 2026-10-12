/**
 * Agent « DPGF depuis le CCTP » :
 * 1. préparation : document DPGF rattaché au CCTP, une étape par chapitre du CCTP ;
 * 2. une étape par chapitre : postes proposés (désignation, unité, article du CCTP, ouvrage du métré) ;
 *    la quantité vient du métré, vaut 1 pour un forfait, ou reste « à métrer » ; aucun prix n'est proposé ;
 * 3. contrôle : qualité (quantités, liens, unités, doublons), numérotation, bilan des prix d'ouvrage
 *    applicables dans la bibliothèque pour chaque poste (proposés à l'économiste, jamais appliqués d'office),
 *    version figée.
 */
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { callAgent } from "../../ai/client.js";
import { lotRuleText } from "../../ai/lot-rules.js";
import { type CctpBlock, dpgfChapter, metrePostes } from "../../ai/schemas.js";
import { schema } from "../../db/index.js";
import { metreQuantity, renumber } from "../../services/dpgf.js";
import { buildReadings, insertProposedMeasures, METRE_RULES } from "../../services/plan-readings.js";
import { findCandidates } from "../../services/pricing.js";
import { blocksText, checkDpgf, replaceIssues } from "../../services/quality.js";
import { sameUnit } from "../../services/units.js";
import { snapshotDpgf } from "../../services/versions.js";
import type { JobHandler, StepContext } from "../types.js";

export interface DpgfInput {
  cctpDocumentId: string;
  vatRate: string | null;
  instructions: string | null;
}

const INSTRUCTIONS = `Tu es économiste de la construction. À partir d'un chapitre de CCTP et du métré de l'affaire, tu établis les postes correspondants de la DPGF (décomposition du prix global et forfaitaire).
Règles strictes :
- un poste par ouvrage ou prestation à chiffrer séparément ; regroupe les postes en sous-chapitres cohérents si le chapitre en contient plusieurs familles ;
- désignation précise et autonome (matériau, dimensions ou caractéristiques utiles), description facultative pour les précisions ;
- « cctpArticle » est le numéro de l'article du CCTP qui décrit le poste ; « workItemCode » est le code de l'ouvrage du métré correspondant, ou null ;
- « quantityBasis » : « metre » si le poste reprend un ouvrage du métré dans la même unité, « forfait » pour une prestation globale (unité « ens »), « a_metrer » sinon ; ne donne jamais de quantité ni de prix ;
- unités usuelles : m3, m2, ml, u, kg, ens ; l'unité d'un poste « metre » est celle de l'ouvrage ;
- un chapitre de généralités ne donne des postes que pour des prestations réellement à chiffrer (installation de chantier, études d'exécution…) ; sinon, renvoie une liste vide ;
- pas de remplissage, pas de doublon.
Réponds en français.`;

const METRE_POSTES_INSTRUCTIONS = `Tu es économiste de la construction et métreur. Des postes de DPGF restent sans quantité : établis leur métré à partir des relevés de plans fournis, dans l'unité du poste.
- pour chaque poste, propose une ou plusieurs mesures dans l'unité du poste, ou aucune mesure si les relevés ne le permettent pas ;
- une mesure ne reprend que ce que le poste décrit : n'y ajoute pas d'ouvrage d'un autre poste ;
- pour un poste non mesurable, liste dans « missing » chaque donnée manquante, précisément ;
- réponds pour chaque poste demandé avec son « lineId ».
${METRE_RULES}
Les quantités seront calculées par le serveur à partir de tes formules. Réponds en français.`;

/** Postes demandés à chaque appel du métreur. */
const METRE_BATCH = 12;

async function dpgfOf(ctx: StepContext): Promise<string> {
  const prepared = ctx.results.get("preparation") as { dpgfId?: string } | undefined;
  if (!prepared?.dpgfId) throw new Error("DPGF introuvable.");
  return prepared.dpgfId;
}

/** Postes sans quantité qui se mesurent (les forfaits valent 1). */
async function postesToMeasure(ctx: StepContext, dpgfId: string) {
  const lines = await ctx.db
    .select()
    .from(schema.dpgfLine)
    .where(and(eq(schema.dpgfLine.dpgfId, dpgfId), eq(schema.dpgfLine.kind, "poste"), isNull(schema.dpgfLine.quantity)))
    .orderBy(asc(schema.dpgfLine.position));
  return lines.filter((l) => l.unit && l.unit !== "ens");
}

export const dpgfHandler: JobHandler = {
  kind: "generation_dpgf",
  title: () => "DPGF depuis le CCTP",
  stepLabel(name) {
    if (name === "preparation") return "Préparation de la DPGF";
    if (name === "controle") return "Quantités, contrôle qualité et version";
    if (name.startsWith("chapitre:")) return `Postes du chapitre ${name.split(":")[1]} du CCTP`;
    if (name === "metre_postes") return "Postes à métrer : relevés disponibles";
    if (name.startsWith("metre_postes:")) return `Métré des postes à métrer, série ${Number(name.split(":")[1]) + 1}`;
    return name;
  },
  initialSteps: () => ["preparation", "controle"],

  async run(name, ctx) {
    const { db } = ctx;
    const input = ctx.input as unknown as DpgfInput;
    const projectId = ctx.job.projectId!;

    if (name === "preparation") {
      const [cctp] = await db.select().from(schema.cctpDocument).where(eq(schema.cctpDocument.id, input.cctpDocumentId));
      if (!cctp) throw new Error("CCTP introuvable.");
      const [project] = await db.select().from(schema.project).where(eq(schema.project.id, projectId));
      const chapters = await db
        .select()
        .from(schema.cctpSection)
        .where(and(eq(schema.cctpSection.documentId, cctp.id), isNull(schema.cctpSection.parentId)))
        .orderBy(asc(schema.cctpSection.position));
      const [created] = await db
        .insert(schema.dpgf)
        .values({
          projectId,
          lotId: cctp.lotId,
          cctpDocumentId: cctp.id,
          title: cctp.title.replace(/^CCTP/i, "DPGF"),
          currency: project!.currency,
          vatRate: input.vatRate,
          status: "en_generation",
        })
        .returning({ id: schema.dpgf.id });
      // Métré des postes restés à métrer : seulement si des planches de l'affaire ont été lues.
      const [read] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.drawing)
        .where(and(eq(schema.drawing.projectId, projectId), sql`${schema.drawing.extraction} is not null`));
      const steps = [...chapters.map((c) => `chapitre:${c.number}`), ...(Number(read?.n ?? 0) > 0 ? ["metre_postes"] : [])];
      return { result: { dpgfId: created!.id, chapters: chapters.length }, addSteps: steps };
    }

    if (name === "metre_postes") {
      // Postes restés à métrer : métrés à partir des relevés de plans de l'affaire, par séries.
      const dpgfId = await dpgfOf(ctx);
      const postes = await postesToMeasure(ctx, dpgfId);
      if (postes.length === 0) return { result: { postes: 0 } };
      const { readings } = await buildReadings(db, projectId);
      if (readings.length === 0) {
        for (const p of postes) {
          if (p.quantitySource?.startsWith("À métrer")) await db.update(schema.dpgfLine).set({ quantitySource: "À métrer : aucune planche analysée pour l’affaire" }).where(eq(schema.dpgfLine.id, p.id));
        }
        await ctx.log(`${postes.length} poste(s) à métrer : aucune planche lue pour l’affaire, quantités laissées à établir.`);
        return { result: { postes: postes.length, batches: 0 } };
      }
      const batches: string[][] = [];
      for (let i = 0; i < postes.length; i += METRE_BATCH) batches.push(postes.slice(i, i + METRE_BATCH).map((p) => p.id));
      await ctx.log(`${postes.length} poste(s) à métrer à partir de ${readings.length} planche(s) lue(s).`);
      return { result: { postes: postes.length, batches }, addSteps: batches.map((_, i) => `metre_postes:${i}`) };
    }

    if (name.startsWith("metre_postes:")) {
      const dpgfId = await dpgfOf(ctx);
      const { batches } = (ctx.results.get("metre_postes") ?? { batches: [] }) as { batches: string[][] };
      const ids = batches[Number(name.split(":")[1])] ?? [];
      const postes = (await postesToMeasure(ctx, dpgfId)).filter((p) => ids.includes(p.id));
      if (postes.length === 0) return { result: { measured: 0 } };
      const readingsData = await buildReadings(db, projectId);
      const [cctp] = await db.select().from(schema.cctpDocument).where(eq(schema.cctpDocument.id, input.cctpDocumentId));
      const lot = cctp?.lotId ? (await db.select().from(schema.projectLot).where(eq(schema.projectLot.id, cctp.lotId)))[0] : undefined;
      const output = await callAgent({
        agent: "metreur",
        role: "generation",
        projectId,
        jobId: ctx.job.id,
        instructions: METRE_POSTES_INSTRUCTIONS,
        input: [
          `Lot : ${lot ? `${lot.code} ${lot.name}` : "non précisé"}.`,
          lotRuleText(lot?.tradeFamily),
          `Postes à métrer (JSON) :\n${JSON.stringify(postes.map((p) => ({ lineId: p.id, numero: p.code, designation: p.designation, description: p.description, unite: p.unit })))}`,
          `Relevés des planches (JSON) :\n${JSON.stringify(readingsData.readings)}`,
        ].join("\n\n"),
        schema: metrePostes,
        schemaName: "metre_postes",
        summary: `Métré des postes ${postes.map((p) => p.code).join(", ")}`,
        maxOutputTokens: 20_000,
        effort: "medium",
      });
      let measured = 0;
      const warnings = [...output.warnings];
      const existingCodes = new Set((await db.select({ code: schema.workItem.code }).from(schema.workItem).where(eq(schema.workItem.projectId, projectId))).map((w) => w.code));
      for (const poste of postes) {
        const answer = output.postes.find((a) => a.lineId === poste.id);
        const missing = (answer?.missing ?? []).map((m) => m.trim()).filter(Boolean);
        const measurements = (answer?.measurements ?? []).filter((m) => sameUnit(m.unit, poste.unit!));
        if (measurements.length === 0) {
          const reason = missing.length ? missing.join(" ; ") : "aucune mesure possible avec les relevés disponibles";
          await db.update(schema.dpgfLine).set({ quantitySource: `À métrer : ${reason}`.slice(0, 600) }).where(eq(schema.dpgfLine.id, poste.id));
          continue;
        }
        // Ouvrage du métré propre au poste : même désignation et même unité, référence au numéro du poste.
        let code = `P${poste.code ?? poste.position}`;
        while (existingCodes.has(code)) code = `${code}b`;
        existingCodes.add(code);
        const workItemId = await db.transaction(async (tx) => {
          const [item] = await tx
            .insert(schema.workItem)
            .values({ projectId, lotId: lot?.id ?? null, code, designation: poste.designation, description: poste.description, unit: poste.unit, missingData: missing.slice(0, 12), origin: "proposition_ia", jobId: ctx.job.id })
            .returning({ id: schema.workItem.id });
          const inserted = await insertProposedMeasures(tx, { projectId, lotId: lot?.id ?? null, workItemId: item!.id, code, measurements, readings: readingsData });
          warnings.push(...inserted.warnings);
          return item!.id;
        });
        const metre = await metreQuantity(db, workItemId, poste.unit!);
        await db
          .update(schema.dpgfLine)
          .set(metre ? { workItemId, quantity: metre.quantity, quantitySource: metre.source } : { workItemId, quantitySource: `À métrer : ${missing.join(" ; ") || "mesure incalculable"}`.slice(0, 600) })
          .where(eq(schema.dpgfLine.id, poste.id));
        if (metre) measured++;
      }
      for (const w of warnings.slice(0, 20)) await ctx.log(w);
      await ctx.log(`${measured} poste(s) sur ${postes.length} métré(s) à partir des plans ; les autres disent la donnée qui manque.`);
      return { result: { measured, postes: postes.length } };
    }

    if (name.startsWith("chapitre:")) {
      const dpgfId = await dpgfOf(ctx);
      const number = name.slice("chapitre:".length);
      const [cctp] = await db.select().from(schema.cctpDocument).where(eq(schema.cctpDocument.id, input.cctpDocumentId));
      const [chapter] = await db
        .select()
        .from(schema.cctpSection)
        .where(and(eq(schema.cctpSection.documentId, input.cctpDocumentId), eq(schema.cctpSection.number, number), isNull(schema.cctpSection.parentId)));
      if (!cctp || !chapter) return { result: { skipped: true } };
      const articles = await db.select().from(schema.cctpSection).where(eq(schema.cctpSection.parentId, chapter.id)).orderBy(asc(schema.cctpSection.position));
      const items = await db
        .select()
        .from(schema.workItem)
        .where(and(eq(schema.workItem.projectId, projectId), cctp.lotId ? eq(schema.workItem.lotId, cctp.lotId) : undefined));
      const metre = await Promise.all(
        items.map(async (i) => ({ code: i.code, designation: i.designation, unite: i.unit, quantite: i.unit ? ((await metreQuantity(db, i.id, i.unit))?.quantity ?? null) : null })),
      );
      const output = await callAgent({
        agent: "economiste_dpgf",
        role: "generation",
        projectId,
        jobId: ctx.job.id,
        instructions: INSTRUCTIONS,
        input: [
          `Chapitre ${chapter.number} du CCTP : ${chapter.title}`,
          `Articles (JSON) :\n${JSON.stringify(articles.map((a) => ({ numero: a.number, titre: a.title, objet: a.intent, texte: blocksText((a.content ?? []) as CctpBlock[]).slice(0, 3000) })))}`,
          `Métré du lot (JSON) :\n${JSON.stringify(metre)}`,
          input.instructions ? `Consigne de l'administrateur : ${input.instructions}` : null,
        ]
          .filter(Boolean)
          .join("\n\n"),
        schema: dpgfChapter,
        schemaName: "dpgf_chapitre",
        summary: `DPGF, postes du chapitre ${chapter.number} ${chapter.title}`,
        maxOutputTokens: 16_000,
        effort: "low",
      });
      const postes = output.groups.flatMap((g) => g.postes);
      if (postes.length === 0) return { result: { chapter: number, postes: 0 } };

      // Quantités calculées avant la transaction (aucune lecture hors transaction pendant l'écriture).
      const quantities = new Map<object, { quantity: string | null; source: string }>();
      for (const p of postes) {
        const item = items.find((i) => i.code && i.code === p.workItemCode?.trim());
        if (p.quantityBasis === "forfait") quantities.set(p, { quantity: "1.0000", source: "Forfait" });
        else if (p.quantityBasis === "metre" && item) {
          const fromMetre = await metreQuantity(db, item.id, p.unit);
          quantities.set(p, fromMetre ? { quantity: fromMetre.quantity, source: fromMetre.source } : { quantity: null, source: "À métrer : aucune mesure dans cette unité" });
        } else quantities.set(p, { quantity: null, source: "À métrer" });
      }

      let position = 100_000 + (Number.parseInt(number, 10) || 0) * 1000;
      let created = 0;
      await db.transaction(async (tx) => {
        const [chapterLine] = await tx
          .insert(schema.dpgfLine)
          .values({ dpgfId, position: position++, kind: "chapitre", designation: output.title.trim() || chapter.title, cctpRef: chapter.number, cctpSectionId: chapter.id })
          .returning({ id: schema.dpgfLine.id });
        for (const group of output.groups) {
          if (group.postes.length === 0) continue;
          let parentId = chapterLine!.id;
          if (group.title && output.groups.filter((g) => g.postes.length).length > 1) {
            const [sub] = await tx
              .insert(schema.dpgfLine)
              .values({ dpgfId, parentId: chapterLine!.id, position: position++, kind: "sous_chapitre", designation: group.title.trim() })
              .returning({ id: schema.dpgfLine.id });
            parentId = sub!.id;
          }
          for (const p of group.postes) {
            const article = articles.find((a) => a.number === p.cctpArticle?.trim());
            const item = items.find((i) => i.code && i.code === p.workItemCode?.trim());
            const { quantity, source: quantitySource } = quantities.get(p)!;
            await tx.insert(schema.dpgfLine).values({
              dpgfId,
              parentId,
              position: position++,
              kind: "poste",
              designation: p.designation.trim(),
              description: p.description?.trim() || null,
              unit: p.quantityBasis === "forfait" ? "ens" : p.unit.trim(),
              quantity,
              quantitySource,
              cctpRef: article?.number ?? p.cctpArticle ?? null,
              cctpSectionId: article?.id ?? null,
              workItemId: item?.id ?? null,
              status: "non_chiffre",
            });
            created++;
          }
        }
      });
      return { result: { chapter: number, postes: created } };
    }

    if (name === "controle") {
      const dpgfId = await dpgfOf(ctx);
      await renumber(db, dpgfId);
      const issues = await replaceIssues(db, { projectId, documentType: "dpgf", documentId: dpgfId }, await checkDpgf(db, dpgfId));
      // Prix d'ouvrage de même unité disponibles dans la bibliothèque : un bilan, rien n'est appliqué.
      const [doc] = await db.select().from(schema.dpgf).where(eq(schema.dpgf.id, dpgfId));
      const [project] = await db.select().from(schema.project).where(eq(schema.project.id, projectId));
      const postes = await db
        .select()
        .from(schema.dpgfLine)
        .where(and(eq(schema.dpgfLine.dpgfId, dpgfId), eq(schema.dpgfLine.kind, "poste")));
      let withPrice = 0;
      for (const line of postes) {
        if (!line.unit) continue;
        const candidates = await findCandidates(db, { text: `${line.designation} ${line.description ?? ""}`, currency: doc!.currency, country: project!.country, city: project!.city, limit: 10, purpose: "ligne" });
        if (candidates.some((c) => sameUnit(c.unit, line.unit))) withPrice++;
      }
      await ctx.log(
        withPrice
          ? `${withPrice} poste(s) sur ${postes.length} avec au moins un prix d’ouvrage applicable dans la bibliothèque : à examiner avec « Prix de la bibliothèque ».`
          : `Aucun prix d’ouvrage applicable dans la bibliothèque pour ces ${postes.length} poste(s) : chiffrage par sous-détail ou par saisie.`,
      );
      await db.update(schema.dpgf).set({ status: "a_valider" }).where(eq(schema.dpgf.id, dpgfId));
      const version = await snapshotDpgf(db, dpgfId, "Établie par l’agent");
      return { result: { dpgfId, issues, version, libraryMatches: withPrice } };
    }
    return {};
  },

  async finished(job, db) {
    const [step] = await db
      .select({ result: schema.generationStep.result })
      .from(schema.generationStep)
      .where(and(eq(schema.generationStep.jobId, job.id), eq(schema.generationStep.name, "controle")));
    const r = (step?.result ?? {}) as { dpgfId?: string; issues?: number; libraryMatches?: number };
    const postes = r.dpgfId ? (await db.select({ id: schema.dpgfLine.id }).from(schema.dpgfLine).where(and(eq(schema.dpgfLine.dpgfId, r.dpgfId), eq(schema.dpgfLine.kind, "poste")))).length : 0;
    return {
      title: `DPGF établie : ${postes} poste(s), ${r.issues ?? 0} point(s) à vérifier${r.libraryMatches ? `, ${r.libraryMatches} avec un prix proposé par la bibliothèque` : ""}`,
      link: job.projectId ? `/administration/affaires/${job.projectId}?onglet=dpgf${r.dpgfId ? `&dpgf=${r.dpgfId}` : ""}` : null,
    };
  },

  async failed(job, db) {
    const [step] = await db
      .select({ result: schema.generationStep.result })
      .from(schema.generationStep)
      .where(and(eq(schema.generationStep.jobId, job.id), eq(schema.generationStep.name, "preparation")));
    const dpgfId = (step?.result as { dpgfId?: string } | null)?.dpgfId;
    if (dpgfId) await db.update(schema.dpgf).set({ status: "brouillon" }).where(eq(schema.dpgf.id, dpgfId));
  },
};
