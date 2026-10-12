/**
 * Agent de recherche de prix, dans la génération du dossier : pour chaque poste encore sans prix d'une DPGF,
 * prix candidats cherchés dans la bibliothèque (prix d'ouvrage de même unité, même devise et même pays,
 * jamais historiques, jamais une valeur réglementaire), puis choix par l'agent parmi ces seuls candidats.
 * Le serveur applique le prix choisi avec les règles d'un choix manuel (services/dpgf-prices.ts) : provenance
 * inscrite, poste à vérifier. Un poste dont un sous-détail donne déjà un prix est laissé à ce sous-détail, qui
 * se valide puis se reporte. Un poste sans candidat reste à chiffrer, et c'est dit.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { callAgent } from "../../ai/client.js";
import { quotePricing } from "../../ai/schemas.js";
import { schema } from "../../db/index.js";
import { applyLibraryPrice } from "../../services/dpgf-prices.js";
import { findCandidates, type PriceCandidate } from "../../services/pricing.js";
import { checkDpgf, replaceIssues } from "../../services/quality.js";
import { readSetting } from "../../services/settings.js";
import { sameUnit } from "../../services/units.js";
import type { StepContext, StepOutcome } from "../types.js";

/** Postes soumis à l'agent par recherche : chaque poste interroge la bibliothèque. */
const LIMIT = 150;
const NOTE = "proposé par l’agent de recherche de prix";

const INSTRUCTIONS = `Tu es économiste de la construction. Pour chaque poste d'une DPGF, choisis le prix qui correspond réellement au poste parmi ses prix candidats de la bibliothèque, ou aucun.
Règles strictes :
- « priceItemId » est l'identifiant d'un des candidats proposés pour ce poste, ou null si aucun ne correspond exactement (nature de l'ouvrage, matériau, dimensions, unité, portée fourniture et pose) ;
- tu ne donnes jamais de prix toi-même et tu ne modifies aucune quantité ;
- justifie brièvement chaque choix.
Réponds en français.`;

export async function priceResearchStep(ctx: StepContext, dpgfId: string): Promise<StepOutcome> {
  const { db } = ctx;
  const [doc] = await db.select().from(schema.dpgf).where(eq(schema.dpgf.id, dpgfId));
  if (!doc) throw new Error("DPGF introuvable : recherche de prix impossible.");
  const [project] = await db.select().from(schema.project).where(eq(schema.project.id, doc.projectId));
  const postes = await db
    .select()
    .from(schema.dpgfLine)
    .where(and(eq(schema.dpgfLine.dpgfId, dpgfId), eq(schema.dpgfLine.kind, "poste")))
    .orderBy(asc(schema.dpgfLine.position));
  const unpriced = postes.filter((p) => p.unitPrice === null);
  if (unpriced.length === 0) {
    await ctx.log(`${doc.title} : tous les postes ont déjà un prix, rien à chercher.`);
    return { result: { applied: 0, searched: 0, breakdowns: 0, remaining: 0 } };
  }
  // Un sous-détail chiffré reste la source du prix de son poste : il se valide, puis se reporte.
  const priced = await db
    .select({ lineId: schema.priceBreakdown.dpgfLineId })
    .from(schema.priceBreakdown)
    .where(and(inArray(schema.priceBreakdown.dpgfLineId, unpriced.map((p) => p.id)), sql`${schema.priceBreakdown.computedUnitPrice} is not null`));
  const byBreakdown = new Set(priced.map((b) => b.lineId));
  const targets = unpriced.filter((p) => p.unit && !byBreakdown.has(p.id)).slice(0, LIMIT);
  const withoutUnit = unpriced.filter((p) => !p.unit).length;

  const { stalePriceMonths } = await readSetting("alertes");
  const candidates = new Map<string, PriceCandidate[]>();
  for (const p of targets) {
    const found = await findCandidates(db, { text: `${p.designation} ${p.description ?? ""}`, currency: doc.currency, country: project!.country, city: project!.city, limit: 15, purpose: "devis", staleMonths: stalePriceMonths });
    const fitting = found.filter((c) => sameUnit(c.unit, p.unit)).slice(0, 5);
    if (fitting.length) candidates.set(p.id, fitting);
  }

  let applied = 0;
  const refused: string[] = [];
  if (candidates.size) {
    const request = [...candidates.entries()].map(([key, list]) => {
      const poste = targets.find((p) => p.id === key)!;
      return {
        key,
        designation: poste.designation,
        description: poste.description,
        unite: poste.unit,
        prixCandidats: list.map((c) => ({ id: c.id, designation: c.designation, unite: c.unit, portee: c.scope, prixUnitaireHT: c.unitPriceHt, zone: c.zone, date: c.period ?? c.priceDate, fiabilite: c.reliability })),
      };
    });
    const output = await callAgent({
      agent: "chercheur_prix",
      role: "generation",
      projectId: doc.projectId,
      jobId: ctx.job.id,
      instructions: INSTRUCTIONS,
      input: `Devise : ${doc.currency}.\n\nPostes (JSON) :\n${JSON.stringify(request)}`,
      schema: quotePricing,
      schemaName: "prix_postes",
      summary: `${doc.title} : prix de ${request.length} poste(s)`,
      maxOutputTokens: 8_000,
      effort: "low",
    });
    const chosen = output.choices.filter((c) => c.priceItemId && candidates.get(c.key)?.some((x) => x.id === c.priceItemId));
    const prices = chosen.length
      ? await db
          .select({ price: schema.priceItem, sourceName: schema.priceSource.name })
          .from(schema.priceItem)
          .leftJoin(schema.priceSource, eq(schema.priceSource.id, schema.priceItem.sourceId))
          .where(inArray(schema.priceItem.id, chosen.map((c) => c.priceItemId!)))
      : [];
    for (const choice of chosen) {
      const line = targets.find((p) => p.id === choice.key);
      const reason = await applyLibraryPrice(db, line, prices.find((x) => x.price.id === choice.priceItemId), doc, project!.country, NOTE);
      if (reason) refused.push(`${line?.designation ?? "Poste"} : ${reason}`);
      else applied++;
    }
  }
  if (applied) {
    // Une DPGF validée qui reçoit des prix redevient « à valider ».
    await db.update(schema.dpgf).set({ status: sql`case when ${schema.dpgf.status} = 'valide' then 'a_valider'::document_status else ${schema.dpgf.status} end` }).where(eq(schema.dpgf.id, dpgfId));
    await replaceIssues(db, { projectId: doc.projectId, documentType: "dpgf", documentId: dpgfId }, await checkDpgf(db, dpgfId));
  }
  for (const r of refused.slice(0, 10)) await ctx.log(r);
  const remaining = unpriced.length - applied - byBreakdown.size;
  await ctx.log(
    [
      `${doc.title} : ${applied} prix appliqué(s) depuis la bibliothèque, à vérifier`,
      byBreakdown.size ? `${byBreakdown.size} poste(s) chiffré(s) par un sous-détail, à valider puis reporter` : null,
      remaining ? `${remaining} poste(s) sans prix adapté dans la bibliothèque, à chiffrer${withoutUnit ? `, dont ${withoutUnit} sans unité` : ""}` : null,
    ]
      .filter(Boolean)
      .join(" ; ") + ".",
  );
  return { result: { applied, searched: targets.length, candidates: candidates.size, breakdowns: byBreakdown.size, remaining } };
}
