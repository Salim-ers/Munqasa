/**
 * « Générer mon devis avec l'IA » : à partir d'une description et des données de l'affaire (CCTP, DPGF,
 * métré), l'agent propose les postes, puis choisit leurs prix parmi les candidats de la bibliothèque.
 *
 * Garde-fous appliqués par le serveur, quoi que réponde le modèle :
 * - une quantité vient d'un poste de DPGF ou d'un ouvrage du métré désignés par leur identifiant, ou d'un
 *   nombre écrit dans la description et cité mot pour mot ; sinon elle reste à préciser ;
 * - un prix vient de la DPGF ou d'un candidat de la bibliothèque proposé pour ce poste (jamais historique,
 *   jamais un salaire minimal) ; sinon il reste à établir ;
 * - les conditions, mentions et taux restent ceux des réglages de l'entité : l'agent n'en écrit aucun.
 */
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { callAgent } from "../../ai/client.js";
import { type QuoteDraft, quoteDraft, quotePricing } from "../../ai/schemas.js";
import { schema } from "../../db/index.js";
import type { QuotePriceSnapshot } from "../../db/schema/commerce.js";
import { Dec } from "../../services/decimal.js";
import { metreQuantity } from "../../services/dpgf.js";
import { findCandidates, type PriceCandidate } from "../../services/pricing.js";
import { lineFromPrice, loadQuote, quoteChecks, recomputeQuote } from "../../services/quotes.js";
import { readSetting } from "../../services/settings.js";
import { sameUnit } from "../../services/units.js";
import type { JobHandler } from "../types.js";

export interface QuoteAiInput {
  quoteId: string;
  description: string | null;
  lotIds: string[];
  useCctp: boolean;
  useDpgf: boolean;
  useMetre: boolean;
}

const LIMIT = 150;

const POSTES_INSTRUCTIONS = `Tu es économiste de la construction et tu prépares un devis de travaux.
À partir de la description de l'utilisateur et des données de l'affaire (articles de CCTP, postes de DPGF, ouvrages du métré), propose les postes du devis.
Règles strictes :
- tu ne donnes jamais de prix ;
- une quantité vient uniquement : d'un poste de DPGF (source « dpgf », son identifiant dans « sourceId ») ; d'un ouvrage du métré (source « metre », son identifiant) ; ou d'un nombre écrit dans la description de l'utilisateur (source « description », « quantity » égale à ce nombre, « quantityQuote » citant mot pour mot le passage qui le porte, par exemple « 120 m² de murs ») ; sinon source « aucune » et « quantity » à null ;
- n'invente aucune quantité, aucune caractéristique, aucune obligation contractuelle, aucun délai, aucune condition de paiement ;
- « section » regroupe les postes par lot ou par nature de travaux (« Lot 19, Peinture », « Démolition ») ; null s'il n'y a qu'un groupe ;
- désignations précises et professionnelles, une unité usuelle (m², m³, ml, u, ens, h, forfait) ;
- « key » est un identifiant court unique par poste (p1, p2…) ;
- « questions » liste les points à confirmer par l'utilisateur (caractéristiques, quantités manquantes, choix techniques) ;
- « title » est l'objet du devis en quelques mots.
Réponds en français.`;

const PRICING_INSTRUCTIONS = `Tu es économiste de la construction. Pour chaque poste d'un devis, choisis le prix qui correspond réellement au poste parmi ses prix candidats de la bibliothèque, ou aucun.
Règles strictes :
- « priceItemId » est l'identifiant d'un des candidats proposés pour ce poste, ou null si aucun ne correspond exactement (nature, matériau, unité, portée fourniture et pose) ;
- tu ne donnes jamais de prix toi-même ;
- justifie brièvement chaque choix.
Réponds en français.`;

/** Texte comparable : minuscules, espaces simples, virgule décimale ramenée au point. */
const plain = (text: string) => text.toLowerCase().replace(/[  \s]+/g, " ").replace(/(\d),(\d)/g, "$1.$2").trim();

/** Quantité tirée de la description : le nombre doit figurer dans le passage cité, lui-même présent mot pour mot. */
export function quantityFromDescription(description: string | null, quantity: string | null, quote: string | null): string | null {
  if (!description || !quantity || !quote) return null;
  const value = quantity.replace(/\s/g, "").replace(",", ".");
  if (!/^\d{1,12}(\.\d{1,4})?$/.test(value) || Number(value) <= 0) return null;
  const text = plain(description);
  const cited = plain(quote);
  if (!cited || !text.includes(cited)) return null;
  const numbers = [...cited.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  return numbers.includes(Number(value)) ? new Dec(value).toFixed() : null;
}

interface Validated {
  key: string;
  section: string | null;
  designation: string;
  description: string | null;
  unit: string | null;
  quantity: string | null;
  quantitySource: string;
  workItemId: string | null;
  dpgfLineId: string | null;
  /** Prix repris d'un poste de DPGF déjà chiffré. */
  dpgfPrice: { unitPrice: string; origin: string; snapshot: QuotePriceSnapshot } | null;
  lotId: string | null;
}

export const quoteAiHandler: JobHandler = {
  kind: "generation_devis",
  title: () => "Préparation d’un devis par l’IA",
  stepLabel(name) {
    if (name === "postes") return "Postes et quantités";
    if (name === "prix") return "Prix de la bibliothèque";
    if (name === "controle") return "Contrôle du devis";
    return name;
  },
  initialSteps: () => ["postes", "prix", "controle"],

  async run(name, ctx) {
    const { db } = ctx;
    const input = ctx.input as unknown as QuoteAiInput;
    const { quote } = await loadQuote(db, input.quoteId);

    if (name === "postes") {
      const projectId = quote.projectId;
      const lotFilter = input.lotIds.length ? input.lotIds : null;
      const dpgfPostes: Array<typeof schema.dpgfLine.$inferSelect & { dpgfTitle: string; currency: string; lotId: string | null }> = [];
      const metre: Array<{ id: string; designation: string; unit: string | null; lotId: string | null; quantity: string | null; source: string }> = [];
      const articles: Array<{ numero: string; titre: string; extrait: string }> = [];
      if (projectId && input.useDpgf) {
        const docs = await db
          .select()
          .from(schema.dpgf)
          .where(and(eq(schema.dpgf.projectId, projectId), lotFilter ? or(inArray(schema.dpgf.lotId, lotFilter), isNull(schema.dpgf.lotId)) : undefined));
        for (const doc of docs) {
          const lines = await db
            .select()
            .from(schema.dpgfLine)
            .where(and(eq(schema.dpgfLine.dpgfId, doc.id), eq(schema.dpgfLine.kind, "poste")))
            .orderBy(asc(schema.dpgfLine.position));
          dpgfPostes.push(...lines.map((l) => ({ ...l, dpgfTitle: doc.title, currency: doc.currency, lotId: doc.lotId })));
        }
      }
      if (projectId && input.useMetre) {
        const items = await db
          .select()
          .from(schema.workItem)
          .where(and(eq(schema.workItem.projectId, projectId), lotFilter ? inArray(schema.workItem.lotId, lotFilter) : undefined))
          .orderBy(asc(schema.workItem.code));
        for (const item of items.slice(0, LIMIT)) {
          const m = item.unit ? await metreQuantity(db, item.id, item.unit) : null;
          metre.push({ id: item.id, designation: item.designation, unit: item.unit, lotId: item.lotId, quantity: m?.quantity ?? null, source: m?.source ?? "aucune mesure" });
        }
      }
      if (projectId && input.useCctp) {
        const docs = await db
          .select()
          .from(schema.cctpDocument)
          .where(and(eq(schema.cctpDocument.projectId, projectId), lotFilter ? or(inArray(schema.cctpDocument.lotId, lotFilter), isNull(schema.cctpDocument.lotId)) : undefined));
        for (const doc of docs) {
          const sections = await db
            .select()
            .from(schema.cctpSection)
            .where(and(eq(schema.cctpSection.documentId, doc.id), eq(schema.cctpSection.kind, "article")))
            .orderBy(asc(schema.cctpSection.position));
          articles.push(...sections.slice(0, 80).map((s) => ({ numero: s.number, titre: s.title, extrait: JSON.stringify(s.content ?? []).replace(/[{}"[\]]/g, " ").replace(/\s+/g, " ").slice(0, 300) })));
        }
      }
      const lots = projectId ? await db.select().from(schema.projectLot).where(eq(schema.projectLot.projectId, projectId)) : [];
      const sources = {
        description: input.description,
        lots: lots.filter((l) => !lotFilter || lotFilter.includes(l.id)).map((l) => `Lot ${l.code}, ${l.name}`),
        dpgf: dpgfPostes.slice(0, LIMIT).map((l) => ({ id: l.id, code: l.code, designation: l.designation, unite: l.unit, quantite: l.quantity })),
        metre: metre.map((m) => ({ id: m.id, designation: m.designation, unite: m.unit, quantite: m.quantity })),
        cctp: articles,
      };
      if (!input.description && sources.dpgf.length === 0 && sources.metre.length === 0 && sources.cctp.length === 0) {
        throw new Error("Rien à exploiter : décrivez les travaux, ou établissez d’abord le CCTP, la DPGF ou le métré de l’affaire.");
      }
      const output = await callAgent({
        agent: "redacteur_devis",
        role: "generation",
        projectId,
        jobId: ctx.job.id,
        instructions: POSTES_INSTRUCTIONS,
        input: `Devise : ${quote.currency}.\n\nSources (JSON) :\n${JSON.stringify(sources)}`,
        schema: quoteDraft,
        schemaName: "devis_postes",
        summary: `Devis ${quote.number} : ${sources.dpgf.length} poste(s) de DPGF, ${sources.metre.length} ouvrage(s), ${sources.cctp.length} article(s)`,
        maxOutputTokens: 16_000,
        effort: "medium",
      });
      const byDpgf = new Map(dpgfPostes.map((l) => [l.id, l]));
      const byMetre = new Map(metre.map((m) => [m.id, m]));
      const keys = new Set<string>();
      const validated: Validated[] = [];
      let rejected = 0;
      for (const poste of output.postes) {
        const key = keys.has(poste.key) ? `${poste.key}-${validated.length}` : poste.key;
        keys.add(key);
        const base: Validated = { key, section: poste.section?.trim() || null, designation: poste.designation.trim().slice(0, 500), description: poste.description?.trim() || null, unit: poste.unit?.trim().slice(0, 20) || null, quantity: null, quantitySource: "À préciser", workItemId: null, dpgfLineId: null, dpgfPrice: null, lotId: null };
        if (!base.designation) continue;
        const dpgfLine = poste.source === "dpgf" && poste.sourceId ? byDpgf.get(poste.sourceId) : undefined;
        const item = poste.source === "metre" && poste.sourceId ? byMetre.get(poste.sourceId) : undefined;
        if (dpgfLine) {
          base.dpgfLineId = dpgfLine.id;
          base.lotId = dpgfLine.lotId;
          base.unit = dpgfLine.unit ?? base.unit;
          base.quantity = dpgfLine.quantity;
          base.quantitySource = dpgfLine.quantitySource ?? (dpgfLine.quantity ? "DPGF" : "À préciser");
          if (dpgfLine.unitPrice !== null) {
            base.dpgfPrice = {
              unitPrice: new Dec(dpgfLine.unitPrice).toDecimalPlaces(2).toFixed(2),
              origin: `DPGF : ${dpgfLine.priceSource ?? dpgfLine.dpgfTitle}`.slice(0, 300),
              snapshot: { designation: dpgfLine.designation, unitPrice: dpgfLine.unitPrice, unitPriceHt: dpgfLine.unitPrice, taxBasis: "HT", currency: dpgfLine.currency, priceDate: new Date(dpgfLine.updatedAt).toISOString().slice(0, 10), period: null, sourceName: dpgfLine.dpgfTitle, reliability: null, verificationStatus: dpgfLine.status === "valide" ? "verifie" : "a_verifier", historical: false, regulated: false },
            };
          }
        } else if (item) {
          base.workItemId = item.id;
          base.lotId = item.lotId;
          base.unit = item.unit ?? base.unit;
          base.quantity = item.quantity;
          base.quantitySource = item.quantity ? item.source : "À métrer : aucune mesure dans l’unité de l’ouvrage";
        } else if (poste.source === "description") {
          base.quantity = quantityFromDescription(input.description, poste.quantity, poste.quantityQuote);
          if (base.quantity) base.quantitySource = `Description : « ${poste.quantityQuote!.trim().slice(0, 200)} »`;
          else if (poste.quantity) rejected++;
        } else if (poste.source !== "aucune" && poste.quantity) rejected++;
        validated.push(base);
      }
      if (rejected) await ctx.log(`${rejected} quantité(s) proposée(s) sans source vérifiable : laissée(s) à préciser.`);
      await ctx.log(`${validated.length} poste(s) proposé(s), ${validated.filter((v) => v.quantity).length} avec une quantité justifiée.`);
      return { result: { title: output.title.trim().slice(0, 300), postes: validated, questions: output.questions.map((q) => q.trim()).filter(Boolean).slice(0, 20) } };
    }

    if (name === "prix") {
      const draft = (ctx.results.get("postes") ?? { postes: [] }) as { postes: Validated[] };
      const [project] = quote.projectId ? await db.select().from(schema.project).where(eq(schema.project.id, quote.projectId)) : [];
      const [company] = quote.companyProfileId ? await db.select().from(schema.companyProfile).where(eq(schema.companyProfile.id, quote.companyProfileId)) : [];
      const country = project?.country ?? company?.country ?? null;
      const { stalePriceMonths } = await readSetting("alertes");
      const candidates = new Map<string, PriceCandidate[]>();
      if (country) {
        for (const poste of draft.postes.filter((p) => !p.dpgfPrice)) {
          const found = await findCandidates(db, { text: `${poste.designation} ${poste.description ?? ""}`, currency: quote.currency, country, city: project?.city ?? null, limit: 15, purpose: "devis", staleMonths: stalePriceMonths });
          const fitting = found.filter((c) => !poste.unit || sameUnit(c.unit, poste.unit)).slice(0, 5);
          if (fitting.length) candidates.set(poste.key, fitting);
        }
      }
      const chosen = new Map<string, string>();
      if (candidates.size) {
        const request = [...candidates.entries()].map(([key, list]) => {
          const poste = draft.postes.find((p) => p.key === key)!;
          return { key, designation: poste.designation, description: poste.description, unite: poste.unit, prixCandidats: list.map((c) => ({ id: c.id, designation: c.designation, unite: c.unit, portee: c.scope, prixUnitaireHT: c.unitPriceHt, zone: c.zone, date: c.period ?? c.priceDate, fiabilite: c.reliability })) };
        });
        const output = await callAgent({
          agent: "redacteur_devis",
          role: "generation",
          projectId: quote.projectId,
          jobId: ctx.job.id,
          instructions: PRICING_INSTRUCTIONS,
          input: `Postes (JSON) :\n${JSON.stringify(request)}`,
          schema: quotePricing,
          schemaName: "devis_prix",
          summary: `Devis ${quote.number} : prix de ${request.length} poste(s)`,
          maxOutputTokens: 8_000,
          effort: "low",
        });
        for (const choice of output.choices) {
          if (choice.priceItemId && candidates.get(choice.key)?.some((c) => c.id === choice.priceItemId)) chosen.set(choice.key, choice.priceItemId);
        }
      }
      // Lignes du devis : sections dans l'ordre des postes, prix de la DPGF, de la bibliothèque, ou à établir.
      const prices = chosen.size ? await db.select({ price: schema.priceItem, sourceName: schema.priceSource.name }).from(schema.priceItem).leftJoin(schema.priceSource, eq(schema.priceSource.id, schema.priceItem.sourceId)).where(inArray(schema.priceItem.id, [...chosen.values()])) : [];
      const existing = await db.select({ id: schema.quoteLine.id }).from(schema.quoteLine).where(eq(schema.quoteLine.quoteId, quote.id));
      if (existing.length) {
        await ctx.log("Le devis contient déjà des lignes : rien n’est ajouté.");
        return { result: { lines: 0 } };
      }
      const sections = new Map<string, string>();
      let position = 0;
      let lines = 0;
      for (const poste of draft.postes) {
        let parentId: string | null = null;
        if (poste.section) {
          parentId = sections.get(poste.section) ?? null;
          if (!parentId) {
            const [section] = await db.insert(schema.quoteLine).values({ quoteId: quote.id, kind: "section", designation: poste.section.slice(0, 500), position: position++, lotId: poste.lotId }).returning({ id: schema.quoteLine.id });
            parentId = section!.id;
            sections.set(poste.section, parentId);
          }
        }
        const libraryId = chosen.get(poste.key);
        const library = libraryId ? prices.find((p) => p.price.id === libraryId) : undefined;
        const priced = library ? await lineFromPrice(library.price, library.sourceName, quote.currency) : null;
        await db.insert(schema.quoteLine).values({
          quoteId: quote.id,
          parentId,
          position: position++,
          kind: "ligne",
          designation: poste.designation,
          description: poste.description,
          unit: poste.unit ?? priced?.unit ?? null,
          quantity: poste.quantity,
          quantitySource: poste.quantitySource,
          workItemId: poste.workItemId,
          dpgfLineId: poste.dpgfLineId,
          lotId: poste.lotId,
          unitPrice: poste.dpgfPrice?.unitPrice ?? priced?.unitPrice ?? null,
          priceItemId: priced?.priceItemId ?? null,
          priceOrigin: poste.dpgfPrice?.origin ?? priced?.priceOrigin ?? null,
          priceSnapshot: poste.dpgfPrice?.snapshot ?? priced?.priceSnapshot ?? null,
        });
        lines++;
      }
      await ctx.log(`${lines} ligne(s) créée(s) : ${draft.postes.filter((p) => p.dpgfPrice).length} prix repris de la DPGF, ${chosen.size} de la bibliothèque, ${lines - draft.postes.filter((p) => p.dpgfPrice).length - chosen.size} à établir.`);
      return { result: { lines } };
    }

    if (name === "controle") {
      const draft = (ctx.results.get("postes") ?? { title: "", questions: [] }) as { title: string; questions: string[] };
      if (draft.title && (quote.title === "Devis" || quote.title.length < 3)) await db.update(schema.quote).set({ title: draft.title }).where(eq(schema.quote.id, quote.id));
      const totals = await recomputeQuote(db, quote.id);
      const fresh = await loadQuote(db, quote.id);
      const checks = quoteChecks(fresh.quote, fresh.lines, totals, null);
      await db.insert(schema.quoteEvent).values({
        quoteId: quote.id,
        kind: "generation",
        note: [`${fresh.lines.filter((l) => l.kind === "ligne").length} ligne(s) préparée(s), ${checks.filter((c) => c.severity === "bloquante").length} point(s) bloquant(s)`, draft.questions.length ? `Points à confirmer : ${draft.questions.join(" ; ")}` : null].filter(Boolean).join(". ").slice(0, 2000),
      });
      await ctx.log(`${checks.length} point(s) à vérifier avant l’envoi.`);
      return { result: { checks: checks.length, questions: draft.questions } };
    }
    return {};
  },

  async finished(job, db) {
    const input = job.input as unknown as QuoteAiInput;
    const [quote] = await db.select().from(schema.quote).where(eq(schema.quote.id, input.quoteId));
    const lines = quote ? await db.select({ id: schema.quoteLine.id, unitPrice: schema.quoteLine.unitPrice, kind: schema.quoteLine.kind }).from(schema.quoteLine).where(eq(schema.quoteLine.quoteId, quote.id)) : [];
    const items = lines.filter((l) => l.kind === "ligne");
    return {
      title: `Devis ${quote?.number ?? ""} préparé : ${items.length} ligne(s), ${items.filter((l) => l.unitPrice === null).length} prix à établir`,
      link: `/administration/devis/${input.quoteId}`,
    };
  },

  async failed(job, db, error) {
    const input = job.input as unknown as QuoteAiInput;
    await db.insert(schema.quoteEvent).values({ quoteId: input.quoteId, kind: "generation", note: `Préparation interrompue : ${error}`.slice(0, 2000) });
  },
};

export type { QuoteDraft };
