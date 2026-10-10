/**
 * Agent « DPGF depuis le CCTP » :
 * 1. préparation : document DPGF rattaché au CCTP, une étape par chapitre du CCTP ;
 * 2. une étape par chapitre : postes proposés (désignation, unité, article du CCTP, ouvrage du métré) ;
 *    la quantité vient du métré, vaut 1 pour un forfait, ou reste « à métrer » ; aucun prix n'est proposé ;
 * 3. contrôle : qualité (quantités, liens, unités, doublons), numérotation, bilan des prix d'ouvrage
 *    applicables dans la bibliothèque pour chaque poste (proposés à l'économiste, jamais appliqués d'office),
 *    version figée.
 */
import { and, asc, eq, isNull } from "drizzle-orm";
import { callAgent } from "../../ai/client.js";
import { type CctpBlock, dpgfChapter } from "../../ai/schemas.js";
import { schema } from "../../db/index.js";
import { metreQuantity, renumber } from "../../services/dpgf.js";
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

async function dpgfOf(ctx: StepContext): Promise<string> {
  const prepared = ctx.results.get("preparation") as { dpgfId?: string } | undefined;
  if (!prepared?.dpgfId) throw new Error("DPGF introuvable.");
  return prepared.dpgfId;
}

export const dpgfHandler: JobHandler = {
  kind: "generation_dpgf",
  title: () => "DPGF depuis le CCTP",
  stepLabel(name) {
    if (name === "preparation") return "Préparation de la DPGF";
    if (name === "controle") return "Quantités, contrôle qualité et version";
    if (name.startsWith("chapitre:")) return `Postes du chapitre ${name.split(":")[1]} du CCTP`;
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
      return { result: { dpgfId: created!.id, chapters: chapters.length }, addSteps: chapters.map((c) => `chapitre:${c.number}`) };
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
