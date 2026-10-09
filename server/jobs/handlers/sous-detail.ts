/**
 * Agent « Sous-détails de prix » :
 * 1. préparation : postes de la DPGF à décomposer, par lots de quatre ;
 * 2. une étape par lot : prix candidats cherchés dans la bibliothèque (même devise, même pays),
 *    décomposition proposée par le modèle ; chaque coût unitaire vient d'un prix de la bibliothèque,
 *    jamais du modèle ; les consommations sont des hypothèses justifiées ; calcul exact par le serveur ;
 * 3. contrôle : prix manquants, prix à vérifier ou anciens, hypothèses, taux non saisis.
 * Un sous-détail déjà validé n'est jamais remplacé.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { callAgent } from "../../ai/client.js";
import { type CctpBlock, sousDetailBatch } from "../../ai/schemas.js";
import { schema } from "../../db/index.js";
import { defaultRates, recomputeBreakdown } from "../../services/breakdowns.js";
import { findCandidates, type PriceCandidate } from "../../services/pricing.js";
import { blocksText, checkBreakdowns, replaceIssues } from "../../services/quality.js";
import { normalizeUnit } from "../../services/units.js";
import type { JobHandler } from "../types.js";

export interface SousDetailInput {
  dpgfId: string;
  lineIds: string[];
  instructions: string | null;
}

const BATCH = 4;

const INSTRUCTIONS = `Tu es économiste de la construction et tu établis les sous-détails de prix unitaires de postes de DPGF.
Pour chaque poste, décompose le prix d'une unité d'ouvrage en composants : matériaux, main-d'œuvre, matériel, sous-traitance, transport, frais de chantier.
Règles strictes :
- tu ne donnes jamais de coût ni de prix : le coût unitaire d'un composant vient uniquement d'un prix candidat de la bibliothèque, désigné par son identifiant dans « priceItemId » ; si aucun candidat ne convient, mets « priceItemId » à null : le composant restera à chiffrer ;
- ne choisis un candidat que si sa désignation et son unité correspondent réellement au composant ;
- « quantity » est la consommation par unité d'ouvrage, exprimée dans l'unité du prix candidat (par exemple 1,05 m3 de béton par m3 d'ouvrage, 6 h de main-d'œuvre par m3) : c'est une hypothèse, justifie-la brièvement dans « justification » (ratio usuel à confirmer, fiche technique, métré…) ;
- « lossRate » : pertes en pourcentage si elles sont pertinentes, sinon null ;
- un candidat de nature « ouvrage » (prix complet d'un ouvrage comparable) peut constituer seul le sous-détail (catégorie sous_traitance, quantité 1) s'il correspond exactement au poste ;
- aucun composant superflu ; réponds pour chaque poste demandé avec son « lineId ».
Réponds en français.`;

/** Date AAAA-MM-JJ écrite à la française (JJ/MM/AAAA). */
const frenchDate = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

/** Nombre décimal positif renvoyé par le modèle, ou null s'il est illisible. */
function decimal(value: string | null, places: number): string | null {
  if (value === null) return null;
  const v = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d{1,12}(\.\d+)?$/.test(v)) return null;
  const [int, dec = ""] = v.split(".");
  return dec ? `${int}.${dec.slice(0, places)}` : int!;
}

export const sousDetailHandler: JobHandler = {
  kind: "sous_detail",
  title: () => "Sous-détails de prix",
  stepLabel(name) {
    if (name === "preparation") return "Préparation des postes";
    if (name === "controle") return "Contrôle qualité";
    if (name.startsWith("postes:")) return `Sous-détails des postes, série ${Number(name.slice("postes:".length)) + 1}`;
    return name;
  },
  initialSteps: () => ["preparation", "controle"],

  async run(name, ctx) {
    const { db } = ctx;
    const input = ctx.input as unknown as SousDetailInput;
    const projectId = ctx.job.projectId!;

    if (name === "preparation") {
      const lines = await db
        .select()
        .from(schema.dpgfLine)
        .where(and(eq(schema.dpgfLine.dpgfId, input.dpgfId), eq(schema.dpgfLine.kind, "poste")))
        .orderBy(asc(schema.dpgfLine.position));
      const existing = await db.select().from(schema.priceBreakdown).where(eq(schema.priceBreakdown.projectId, projectId));
      const locked = new Set(existing.filter((b) => b.locked).map((b) => b.dpgfLineId));
      const wanted = new Set(input.lineIds);
      const targets = lines.filter((l) => (wanted.size === 0 || wanted.has(l.id)) && !locked.has(l.id)).map((l) => l.id);
      if (locked.size) await ctx.log(`${[...locked].filter((id) => wanted.size === 0 || wanted.has(id!)).length} poste(s) au sous-détail déjà validé, laissé(s) tel(s) quel(s).`);
      const batches: string[][] = [];
      for (let i = 0; i < targets.length; i += BATCH) batches.push(targets.slice(i, i + BATCH));
      return { result: { batches }, addSteps: batches.map((_, i) => `postes:${i}`) };
    }

    if (name.startsWith("postes:")) {
      const index = Number(name.slice("postes:".length));
      const { batches } = (ctx.results.get("preparation") ?? { batches: [] }) as { batches: string[][] };
      const ids = batches[index] ?? [];
      if (ids.length === 0) return { result: { postes: 0 } };
      const [dpgf] = await db.select().from(schema.dpgf).where(eq(schema.dpgf.id, input.dpgfId));
      const [project] = await db.select().from(schema.project).where(eq(schema.project.id, projectId));
      const lines = await db.select().from(schema.dpgfLine).where(inArray(schema.dpgfLine.id, ids));
      const sectionIds = lines.map((l) => l.cctpSectionId).filter((v): v is string => Boolean(v));
      const sections = sectionIds.length ? await db.select().from(schema.cctpSection).where(inArray(schema.cctpSection.id, sectionIds)) : [];

      const candidates = new Map<string, PriceCandidate[]>();
      for (const line of lines) {
        candidates.set(line.id, await findCandidates(db, { text: `${line.designation} ${line.description ?? ""}`, currency: dpgf!.currency, country: project!.country, limit: 20 }));
      }
      const request = lines.map((line) => {
        const section = sections.find((s) => s.id === line.cctpSectionId);
        return {
          lineId: line.id,
          numero: line.code,
          designation: line.designation,
          description: line.description,
          unite: line.unit,
          quantite: line.quantity,
          articleCctp: section ? `${section.number} ${section.title} : ${blocksText((section.content ?? []) as CctpBlock[]).slice(0, 1500)}` : null,
          prixCandidats: (candidates.get(line.id) ?? []).map((c) => ({ id: c.id, designation: c.designation, nature: c.kind, unite: c.unit, prixUnitaire: c.unitPrice, devise: c.currency, date: c.priceDate, verifie: c.verified })),
        };
      });
      const output = await callAgent({
        agent: "sous_detail",
        role: "generation",
        projectId,
        jobId: ctx.job.id,
        instructions: INSTRUCTIONS,
        input: [`Devise : ${dpgf!.currency}. Pays : ${project!.country}.`, input.instructions ? `Consigne de l'administrateur : ${input.instructions}` : null, `Postes (JSON) :\n${JSON.stringify(request)}`]
          .filter(Boolean)
          .join("\n\n"),
        schema: sousDetailBatch,
        schemaName: "sous_detail",
        summary: `Sous-détails : ${lines.map((l) => l.code).join(", ")}`,
        maxOutputTokens: 16_000,
        effort: "medium",
      });

      const rates = await defaultRates();
      let created = 0;
      for (const line of lines) {
        const answer = output.postes.find((p) => p.lineId === line.id);
        if (!answer) {
          await ctx.log(`Poste ${line.code} : aucune décomposition proposée.`);
          continue;
        }
        const own = new Map((candidates.get(line.id) ?? []).map((c) => [c.id, c]));
        const breakdownId = await db.transaction(async (tx) => {
          const [previous] = await tx.select().from(schema.priceBreakdown).where(eq(schema.priceBreakdown.dpgfLineId, line.id));
          if (previous?.locked) return null;
          if (previous) await tx.delete(schema.priceBreakdown).where(eq(schema.priceBreakdown.id, previous.id));
          const [b] = await tx
            .insert(schema.priceBreakdown)
            .values({
              projectId,
              dpgfLineId: line.id,
              workItemId: line.workItemId,
              designation: line.designation,
              unit: line.unit ?? "u",
              currency: dpgf!.currency,
              ...rates,
              status: "brouillon",
              notes: answer.notes,
            })
            .returning({ id: schema.priceBreakdown.id });
          let position = 0;
          for (const component of answer.components) {
            const quantity = decimal(component.quantity, 6);
            if (quantity === null) continue;
            // Le coût vient uniquement de la bibliothèque ; l'unité est celle du prix retenu.
            const price = component.priceItemId ? own.get(component.priceItemId) : undefined;
            await tx.insert(schema.priceBreakdownComponent).values({
              breakdownId: b!.id,
              position: position++,
              category: component.category,
              designation: component.designation.trim() || price?.designation || "Composant",
              unit: price?.unit ?? (component.unit.trim() || "u"),
              quantity,
              unitCost: price ? price.unitPrice : null,
              lossRate: decimal(component.lossRate, 4),
              isHypothesis: true,
              priceItemId: price?.id ?? null,
              sourceNote: [component.justification.trim(), price ? `Prix : ${price.designation}, relevé le ${frenchDate(price.priceDate)}` : "Prix à trouver dans la bibliothèque"].filter(Boolean).join(". "),
              details: price && normalizeUnit(price.unit) !== normalizeUnit(component.unit) ? { uniteProposee: component.unit } : {},
            });
          }
          return b!.id;
        });
        if (breakdownId) {
          await recomputeBreakdown(db, breakdownId);
          created++;
        }
      }
      return { result: { postes: created } };
    }

    if (name === "controle") {
      const issues = await replaceIssues(db, { projectId, documentType: "sous_detail", documentId: input.dpgfId }, await checkBreakdowns(db, input.dpgfId));
      return { result: { issues } };
    }
    return {};
  },

  async finished(job, db) {
    const input = job.input as unknown as SousDetailInput;
    const lines = await db.select({ id: schema.dpgfLine.id }).from(schema.dpgfLine).where(and(eq(schema.dpgfLine.dpgfId, input.dpgfId), eq(schema.dpgfLine.kind, "poste")));
    const breakdowns = lines.length ? await db.select().from(schema.priceBreakdown).where(inArray(schema.priceBreakdown.dpgfLineId, lines.map((l) => l.id))) : [];
    const complete = breakdowns.filter((b) => b.computedUnitPrice !== null).length;
    return {
      title: `Sous-détails établis : ${breakdowns.length} poste(s), ${complete} entièrement chiffré(s)`,
      link: job.projectId ? `/administration/affaires/${job.projectId}?onglet=sousdetails&dpgf=${input.dpgfId}` : null,
    };
  },
};
