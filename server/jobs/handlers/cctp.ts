/**
 * Agent « Rédaction du CCTP » :
 * 1. plan : chapitres et articles adaptés au lot, à l'affaire et au métré (sans article de remplissage) ;
 * 2. rédaction : une étape par chapitre (les chapitres longs sont découpés), blocs structurés ;
 * 3. contrôle : qualité (articles vides, références à vérifier, normes hors référentiel, ouvrages non couverts),
 *    puis version figée du document.
 * Mode « réécriture » : quelques articles réécrits selon une consigne, puis contrôle.
 * Seules les références du référentiel choisies peuvent être citées ; aucune valeur technique n'est inventée.
 */
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { callAgent } from "../../ai/client.js";
import { allowedReferences, projectContext } from "../../ai/context.js";
import { type CctpBlock, type CctpDetailLevel, cctpChapter, cctpOutline } from "../../ai/schemas.js";
import { schema } from "../../db/index.js";
import { checkCctp, replaceIssues } from "../../services/quality.js";
import { snapshotCctp } from "../../services/versions.js";
import type { JobHandler, StepContext } from "../types.js";

export interface CctpGenerationInput {
  mode: "generation";
  lotId: string | null;
  detailLevel: CctpDetailLevel;
  useMetre: boolean;
  referenceIds: string[];
  instructions: string | null;
}

export interface CctpRewriteInput {
  mode: "reecriture";
  documentId: string;
  sectionIds: string[];
  instructions: string | null;
}

type CctpInput = CctpGenerationInput | CctpRewriteInput;

/** Au-delà, un chapitre est rédigé en plusieurs fois (taille des réponses et durée des étapes). */
const ARTICLES_PER_STEP = 8;

const LEVELS: Record<CctpDetailLevel, { articles: string; words: string }> = {
  synthetique: { articles: "15 à 25 articles", words: "80 à 150 mots" },
  standard: { articles: "25 à 45 articles", words: "150 à 300 mots" },
  detaille: { articles: "40 à 70 articles", words: "250 à 500 mots" },
};

const PLAN_INSTRUCTIONS = (level: CctpDetailLevel) => `Tu es ingénieur rédacteur de CCTP (cahier des clauses techniques particulières) pour des marchés de bâtiment au Maroc et en France. Tu établis le plan du CCTP du lot indiqué, pour l'affaire décrite.
Règles :
- structure attendue, adaptée au lot et au pays : généralités (objet, consistance, documents et références, sujétions, études d'exécution, implantation, protection et nettoyage), prescriptions sur les matériaux et produits, mise en œuvre et description des ouvrages, contrôles, essais et réception ;
- ne crée que les articles utiles à cette affaire, sans remplissage ni redite ; chaque article a un objet précis (« intent ») ;
- les articles de mise en œuvre reprennent les ouvrages du métré : indique leurs codes dans « workItemCodes » ; chaque ouvrage fourni est couvert par au moins un article ;
- ordre de grandeur pour ce niveau de détail : ${LEVELS[level].articles}, à ajuster à la réalité du projet ;
- numérotation : chapitres « 1 », « 2 »… ; articles « 1.1 », « 1.2 »… ;
- le titre du document nomme le lot (par exemple « CCTP, lot 02 Gros œuvre ») ;
- réponds en français.`;

const WRITE_INSTRUCTIONS = (level: CctpDetailLevel) => `Tu rédiges des articles de CCTP pour l'affaire et le lot décrits. Style prescriptif et précis, au présent de l'obligation (« L'entrepreneur réalise… », « Les bétons sont conformes à… »), phrases complètes, sans formule creuse ni généralité inutile.
Règles strictes :
- cite uniquement les références de la liste fournie : leur identifiant dans « referenceIds » et leur code dans le texte ; n'invente aucune norme, aucun DTU, aucun décret, aucun numéro ; si une exigence normative n'a pas de référence fournie, écris l'exigence sans citer de norme ;
- n'invente aucune valeur technique que l'affaire ne justifie pas (classe de béton, enrobage, dosage, épaisseur…) : prescris la règle (« selon les plans d'exécution visés », « suivant l'étude géotechnique ») ou signale-la dans une « note » comme valeur à préciser par la maîtrise d'œuvre ;
- appuie la consistance des travaux sur les ouvrages et quantités fournis, sans aucun prix ;
- blocs : « paragraphe » (texte), « liste » (items, texte nul), « exigence » (obligation contrôlable), « note » (précision ou point à confirmer) ; pas de Markdown, pas de numérotation dans le texte ;
- longueur indicative : ${LEVELS[level].words} par article, seulement si le contenu le justifie ; un article simple reste court ;
- rédige chaque article demandé, avec exactement le même numéro.
Réponds en français.`;

type SectionRow = typeof schema.cctpSection.$inferSelect;

/** Nettoyage d'une réponse : références limitées à la liste autorisée, blocs vides retirés. */
function sanitizeBlocks(blocks: CctpBlock[], allowed: Set<string>): CctpBlock[] {
  return blocks
    .map((b) => ({
      type: b.type,
      text: b.type === "liste" ? null : (b.text ?? "").trim() || null,
      items: b.type === "liste" ? b.items.map((i) => i.trim()).filter(Boolean) : [],
      referenceIds: [...new Set(b.referenceIds.filter((id) => allowed.has(id)))],
    }))
    .filter((b) => (b.type === "liste" ? b.items.length > 0 : Boolean(b.text)));
}

async function documentOf(ctx: StepContext): Promise<string> {
  const input = ctx.input as unknown as CctpInput;
  if (input.mode === "reecriture") return input.documentId;
  const plan = ctx.results.get("plan") as { documentId?: string } | undefined;
  if (!plan?.documentId) throw new Error("Plan du CCTP introuvable.");
  return plan.documentId;
}

async function writeArticles(ctx: StepContext, documentId: string, articles: SectionRow[], options: { withMetre: boolean; extra: string | null; rewrite: boolean }) {
  const { db } = ctx;
  const [doc] = await db.select().from(schema.cctpDocument).where(eq(schema.cctpDocument.id, documentId));
  if (!doc) throw new Error("CCTP introuvable.");
  const references = await allowedReferences(db, doc.referenceIds);
  const context = await projectContext(db, doc.projectId, doc.lotId, { withMetre: options.withMetre });
  const all = await db.select().from(schema.cctpSection).where(eq(schema.cctpSection.documentId, documentId)).orderBy(asc(schema.cctpSection.position));
  const items = await db.select({ id: schema.workItem.id, code: schema.workItem.code }).from(schema.workItem).where(eq(schema.workItem.projectId, doc.projectId));
  const level = (doc.detailLevel as CctpDetailLevel) ?? "standard";

  const request = articles.map((a) => ({
    number: a.number,
    title: a.title,
    objet: a.intent,
    ouvrage: items.find((i) => i.id === a.workItemId)?.code ?? null,
    contenuActuel: options.rewrite ? a.content : undefined,
  }));
  const output = await callAgent({
    agent: "redacteur_cctp",
    role: "generation",
    projectId: doc.projectId,
    jobId: ctx.job.id,
    instructions: WRITE_INSTRUCTIONS(level),
    input: [
      `Contexte de l'affaire (JSON) :\n${JSON.stringify(context)}`,
      `Plan complet du CCTP : ${all.map((s) => `${s.number} ${s.title}`).join(" ; ")}`,
      `Références autorisées (JSON) :\n${JSON.stringify(references)}`,
      options.extra ? `Consigne de l'administrateur : ${options.extra}` : null,
      `Articles à rédiger (JSON) :\n${JSON.stringify(request)}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
    schema: cctpChapter,
    schemaName: "redaction_cctp",
    summary: `CCTP « ${doc.title} », articles ${articles.map((a) => a.number).join(", ")}`,
    maxOutputTokens: 32_000,
    effort: "medium",
  });

  const allowed = new Set(references.map((r) => r.id));
  let written = 0;
  for (const article of articles) {
    const answer = output.articles.find((x) => x.number.trim() === article.number);
    if (!answer) {
      await ctx.log(`Article ${article.number} non rédigé par le modèle.`);
      continue;
    }
    const blocks = sanitizeBlocks(answer.blocks, allowed);
    await db
      .update(schema.cctpSection)
      .set({ content: blocks, referenceIds: [...new Set(blocks.flatMap((b) => b.referenceIds))], status: blocks.length ? "genere" : "a_rediger", validatedAt: null })
      .where(eq(schema.cctpSection.id, article.id));
    written++;
  }
  return written;
}

export const cctpHandler: JobHandler = {
  kind: "generation_cctp",
  title: (job) => ((job.input as unknown as CctpInput).mode === "reecriture" ? "Réécriture d’articles du CCTP" : "Rédaction du CCTP"),
  stepLabel(name) {
    if (name === "plan") return "Plan du CCTP";
    if (name === "reecriture") return "Réécriture des articles";
    if (name === "controle") return "Contrôle qualité et version";
    if (name.startsWith("chapitre:")) return `Rédaction du chapitre ${name.split(":")[1]}`;
    return name;
  },
  initialSteps: (input) => ((input as unknown as CctpInput).mode === "reecriture" ? ["reecriture", "controle"] : ["plan", "controle"]),

  async run(name, ctx) {
    const { db } = ctx;
    const input = ctx.input as unknown as CctpInput;
    const projectId = ctx.job.projectId!;

    if (name === "plan" && input.mode === "generation") {
      const context = await projectContext(db, projectId, input.lotId, { withMetre: input.useMetre });
      const references = await allowedReferences(db, input.referenceIds);
      const outline = await callAgent({
        agent: "redacteur_cctp",
        role: "generation",
        projectId,
        jobId: ctx.job.id,
        instructions: PLAN_INSTRUCTIONS(input.detailLevel),
        input: [
          `Contexte de l'affaire (JSON) :\n${JSON.stringify(context)}`,
          `Références disponibles (JSON) :\n${JSON.stringify(references)}`,
          input.instructions ? `Consigne de l'administrateur : ${input.instructions}` : null,
        ]
          .filter(Boolean)
          .join("\n\n"),
        schema: cctpOutline,
        schemaName: "plan_cctp",
        summary: `Plan du CCTP${context.lot ? `, lot ${context.lot.code} ${context.lot.nom}` : ""}`,
        maxOutputTokens: 16_000,
        effort: "medium",
      });
      if (outline.chapters.length === 0) throw new Error("Le modèle n’a proposé aucun chapitre.");

      const [project] = await db.select().from(schema.project).where(eq(schema.project.id, projectId));
      const items = await db.select({ id: schema.workItem.id, code: schema.workItem.code }).from(schema.workItem).where(eq(schema.workItem.projectId, projectId));
      const documentId = await db.transaction(async (tx) => {
        const [doc] = await tx
          .insert(schema.cctpDocument)
          .values({
            projectId,
            lotId: input.lotId,
            title: outline.title,
            country: project!.country,
            phase: project!.designPhase,
            detailLevel: input.detailLevel,
            referenceIds: references.map((r) => r.id),
            status: "en_generation",
          })
          .returning({ id: schema.cctpDocument.id });
        let position = 0;
        for (const chapter of outline.chapters) {
          const [parent] = await tx
            .insert(schema.cctpSection)
            .values({ documentId: doc!.id, position: position++, number: chapter.number.trim(), title: chapter.title.trim(), kind: "chapitre", status: "genere" })
            .returning({ id: schema.cctpSection.id });
          for (const article of chapter.articles) {
            const workItemId = items.find((i) => i.code && article.workItemCodes.includes(i.code))?.id ?? null;
            await tx.insert(schema.cctpSection).values({
              documentId: doc!.id,
              parentId: parent!.id,
              position: position++,
              number: article.number.trim(),
              title: article.title.trim(),
              kind: "article",
              intent: article.intent.trim(),
              workItemId,
              status: "a_rediger",
            });
          }
        }
        return doc!.id;
      });
      // Une étape par chapitre, les chapitres longs en plusieurs parties.
      const steps: string[] = [];
      for (const chapter of outline.chapters) {
        const parts = Math.max(1, Math.ceil(chapter.articles.length / ARTICLES_PER_STEP));
        for (let part = 1; part <= parts; part++) steps.push(parts > 1 ? `chapitre:${chapter.number.trim()}:${part}` : `chapitre:${chapter.number.trim()}`);
      }
      const articleCount = outline.chapters.reduce((n, c) => n + c.articles.length, 0);
      await ctx.log(`${outline.chapters.length} chapitres, ${articleCount} articles.`);
      return { result: { documentId, chapters: outline.chapters.length, articles: articleCount }, addSteps: steps };
    }

    if (name.startsWith("chapitre:")) {
      const documentId = await documentOf(ctx);
      const [, number, part] = name.split(":");
      const [chapter] = await db
        .select()
        .from(schema.cctpSection)
        .where(and(eq(schema.cctpSection.documentId, documentId), eq(schema.cctpSection.number, number!), isNull(schema.cctpSection.parentId)));
      if (!chapter) return { result: { skipped: true } };
      const articles = await db.select().from(schema.cctpSection).where(eq(schema.cctpSection.parentId, chapter.id)).orderBy(asc(schema.cctpSection.position));
      const index = part ? Number(part) - 1 : 0;
      const slice = part ? articles.slice(index * ARTICLES_PER_STEP, (index + 1) * ARTICLES_PER_STEP) : articles;
      const written = await writeArticles(ctx, documentId, slice, {
        withMetre: input.mode === "generation" ? input.useMetre : true,
        extra: input.mode === "generation" ? input.instructions : null,
        rewrite: false,
      });
      return { result: { chapter: number, written } };
    }

    if (name === "reecriture" && input.mode === "reecriture") {
      const sections = await db
        .select()
        .from(schema.cctpSection)
        .where(and(eq(schema.cctpSection.documentId, input.documentId), inArray(schema.cctpSection.id, input.sectionIds)))
        .orderBy(asc(schema.cctpSection.position));
      const articles = sections.filter((s) => s.kind === "article");
      if (articles.length === 0) return { result: { written: 0 } };
      const written = await writeArticles(ctx, input.documentId, articles, { withMetre: true, extra: input.instructions, rewrite: true });
      return { result: { written } };
    }

    if (name === "controle") {
      const documentId = await documentOf(ctx);
      const drafts = await checkCctp(db, documentId);
      const issues = await replaceIssues(db, { projectId, documentType: "cctp", documentId }, drafts);
      await db.update(schema.cctpDocument).set({ status: "a_valider" }).where(eq(schema.cctpDocument.id, documentId));
      const version = await snapshotCctp(db, documentId, input.mode === "reecriture" ? "Articles réécrits par l’agent" : "Rédaction par l’agent");
      return { result: { documentId, issues, version } };
    }
    return {};
  },

  async finished(job, db) {
    const [step] = await db
      .select({ result: schema.generationStep.result })
      .from(schema.generationStep)
      .where(and(eq(schema.generationStep.jobId, job.id), eq(schema.generationStep.name, "controle")));
    const r = (step?.result ?? {}) as { documentId?: string; issues?: number };
    const [doc] = r.documentId ? await db.select({ title: schema.cctpDocument.title }).from(schema.cctpDocument).where(eq(schema.cctpDocument.id, r.documentId)) : [];
    return {
      title: `${(job.input as unknown as CctpInput).mode === "reecriture" ? "Articles réécrits" : "CCTP rédigé"}${doc ? ` : ${doc.title}` : ""}, ${r.issues ?? 0} point(s) à vérifier`,
      link: job.projectId ? `/administration/affaires/${job.projectId}?onglet=cctp${r.documentId ? `&document=${r.documentId}` : ""}` : null,
    };
  },

  async failed(job, db) {
    // Document resté « en génération » : il redevient un brouillon consultable.
    const [step] = await db
      .select({ result: schema.generationStep.result })
      .from(schema.generationStep)
      .where(and(eq(schema.generationStep.jobId, job.id), eq(schema.generationStep.name, "plan")));
    const documentId = (step?.result as { documentId?: string } | null)?.documentId;
    if (documentId) await db.update(schema.cctpDocument).set({ status: "brouillon" }).where(eq(schema.cctpDocument.id, documentId));
  },
};
