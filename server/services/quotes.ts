/**
 * Devis : création (vierge, depuis une affaire, une DPGF, le métré ou la bibliothèque, par lot ou sur plusieurs
 * lots), recalcul par le moteur financier, contrôles de complétude, statuts, versions et duplication.
 *
 * Rien n'est inventé : un prix vient de la bibliothèque, de la DPGF, d'un sous-détail ou d'une saisie ; une
 * quantité vient du métré, de la DPGF ou d'une saisie ; sinon la ligne reste « à établir ». Un prix entré dans
 * le devis y est copié avec sa provenance : une mise à jour de la bibliothèque ne modifie jamais un devis.
 */
import { and, asc, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import type { AuditPoint } from "../../shared/audit.js";
import { MARGIN_MODES, PRICE_ORIGIN_LABELS, type QuoteSource, type QuoteStatus, RATE_BASES, type MarginMode, type RateBase } from "../../shared/enums.js";
import { lotLabel } from "../../shared/lots.js";
import { isHistoricalPrice } from "../../shared/prices.js";
import { type Database, schema } from "../db/index.js";
import type { QuotePriceSnapshot } from "../db/schema/commerce.js";
import { Dec } from "./decimal.js";
import { metreQuantity } from "./dpgf.js";
import { exclTax } from "./pricing.js";
import { computeQuote, type QuoteCalcSettings, type QuoteTotals } from "./quote-calc.js";
import { nextReference } from "./references.js";
import { readSetting } from "./settings.js";
import { isKnownUnit, normalizeUnit } from "./units.js";

export type QuoteRow = typeof schema.quote.$inferSelect;
export type QuoteLineRow = typeof schema.quoteLine.$inferSelect;

export class QuoteError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 = 409,
  ) {
    super(message);
  }
}

/** Statuts dans lesquels un devis se modifie ; au-delà, une nouvelle version est nécessaire. */
export const EDITABLE: QuoteStatus[] = ["brouillon", "a_verifier", "valide"];

export function assertEditable(quote: QuoteRow): void {
  if (quote.archivedAt) throw new QuoteError("Ce devis est archivé : restaurez-le pour le modifier.");
  if (!EDITABLE.includes(quote.status) || quote.lockedAt) throw new QuoteError("Ce devis a été envoyé : créez une nouvelle version pour le modifier.");
}

export function settingsOf(quote: QuoteRow): QuoteCalcSettings {
  return {
    vatRate: quote.vatRate,
    discountRate: quote.discountRate,
    taxRegime: quote.taxRegime,
    depositRate: quote.depositRate,
    depositAmount: quote.depositAmount,
    siteCostsRate: quote.siteCostsRate,
    overheadRate: quote.overheadRate,
    overheadBase: (RATE_BASES as readonly string[]).includes(quote.overheadBase) ? (quote.overheadBase as RateBase) : "debourse_total",
    contingencyRate: quote.contingencyRate,
    contingencyBase: (RATE_BASES as readonly string[]).includes(quote.contingencyBase) ? (quote.contingencyBase as RateBase) : "debourse_total",
    marginRate: quote.marginRate,
    marginMode: (MARGIN_MODES as readonly string[]).includes(quote.marginMode) ? (quote.marginMode as MarginMode) : "taux_de_marge",
  };
}

export async function loadQuote(db: Database, id: string): Promise<{ quote: QuoteRow; lines: QuoteLineRow[] }> {
  const [quote] = await db.select().from(schema.quote).where(eq(schema.quote.id, id));
  if (!quote) throw new QuoteError("Devis introuvable.", 404);
  const lines = await db.select().from(schema.quoteLine).where(eq(schema.quoteLine.quoteId, id)).orderBy(asc(schema.quoteLine.position));
  return { quote, lines };
}

/** Recalcule les montants de chaque ligne et les totaux du devis, puis les enregistre. */
export async function recomputeQuote(db: Database, id: string): Promise<QuoteTotals> {
  const { quote, lines } = await loadQuote(db, id);
  const totals = computeQuote(lines, settingsOf(quote));
  for (const line of lines) {
    const net = totals.lines[line.id]?.net ?? null;
    if ((line.amountHt === null ? null : Number(line.amountHt)) !== (net === null ? null : Number(net))) {
      await db.update(schema.quoteLine).set({ amountHt: net }).where(eq(schema.quoteLine.id, line.id));
    }
  }
  await db
    .update(schema.quote)
    .set({ totalHt: totals.state === "non_renseigne" ? null : totals.totalHt, totalVat: totals.totalVat, totalTtc: totals.totalTtc, totalsState: totals.state })
    .where(eq(schema.quote.id, id));
  return totals;
}

/* ---------- Contrôles ---------- */

export interface QuoteCheck {
  severity: "bloquante" | "majeure" | "mineure";
  /** Point du contrôle avant export (shared/audit.ts). */
  point: AuditPoint;
  message: string;
  lineId?: string;
}

/** Raison pour laquelle le prix d'une ligne est incertain, ou null. */
export function priceUncertainty(line: Pick<QuoteLineRow, "priceSnapshot" | "priceConfirmed">): string | null {
  const snap = line.priceSnapshot;
  if (!snap || line.priceConfirmed) return null;
  if (snap.regulated) return "salaire minimal brut, hors charges : ce n’est pas un taux de facturation";
  if (snap.historical) return `prix historique, valeur ${snap.period ?? snap.priceDate.split("-").reverse().join("/")}`;
  if (snap.verificationStatus !== "verifie") return "prix à vérifier";
  if (snap.reliability === "faible") return "fiabilité faible";
  return null;
}

/** Quantité incertaine : métré dont une partie des mesures n'est pas vérifiée. */
export function quantityUncertainty(line: Pick<QuoteLineRow, "quantitySource" | "priceConfirmed">): string | null {
  const m = /Métré : (\d+) mesure\(s\), dont (\d+) vérifiée\(s\)/.exec(line.quantitySource ?? "");
  if (m && Number(m[2]) < Number(m[1]) && !line.priceConfirmed) return "quantité du métré à vérifier";
  return null;
}

export function quoteChecks(quote: QuoteRow, lines: QuoteLineRow[], totals: QuoteTotals, country: string | null): QuoteCheck[] {
  const checks: QuoteCheck[] = [];
  const items = lines.filter((l) => l.kind === "ligne");
  const label = (l: QuoteLineRow) => l.designation.slice(0, 80);
  if (items.length === 0) checks.push({ severity: "bloquante", point: "statuts", message: "Le devis ne contient aucune ligne chiffrable." });
  for (const l of items) {
    const f = totals.lines[l.id];
    if (!f?.unitPrice) checks.push({ severity: "bloquante", point: "prix", message: `Prix à établir : ${label(l)}`, lineId: l.id });
    else if (new Dec(f.unitPrice).lte(0)) checks.push({ severity: "mineure", point: "prix", message: `Prix unitaire nul ou négatif, à confirmer : ${label(l)}`, lineId: l.id });
    if (l.quantity === null) checks.push({ severity: "bloquante", point: "quantites", message: `Quantité à préciser : ${label(l)}`, lineId: l.id });
    else if (new Dec(l.quantity).lte(0)) checks.push({ severity: "majeure", point: "quantites", message: `Quantité nulle ou négative : ${label(l)}`, lineId: l.id });
    if (!l.unit?.trim()) checks.push({ severity: "mineure", point: "unites", message: `Unité non renseignée : ${label(l)}`, lineId: l.id });
    else if (!isKnownUnit(l.unit)) checks.push({ severity: "mineure", point: "unites", message: `Unité non reconnue « ${l.unit} » : ${label(l)}`, lineId: l.id });
    if (quote.taxRegime === "normal" && f?.net && f.vatRate === null) checks.push({ severity: "bloquante", point: "taxes", message: `Taux de TVA à préciser : ${label(l)}`, lineId: l.id });
    const uncertain = priceUncertainty(l);
    if (uncertain) checks.push({ severity: "majeure", point: "prix", message: `Prix incertain, ${uncertain} : ${label(l)}`, lineId: l.id });
    const qty = quantityUncertainty(l);
    if (qty) checks.push({ severity: "majeure", point: "quantites", message: `${qty.charAt(0).toUpperCase()}${qty.slice(1)} : ${label(l)}`, lineId: l.id });
    if (l.priceSnapshot && l.priceSnapshot.currency !== quote.currency) checks.push({ severity: "bloquante", point: "prix", message: `Prix copié en ${l.priceSnapshot.currency} dans un devis en ${quote.currency} : ${label(l)}`, lineId: l.id });
  }
  // Lignes en double : même désignation et même unité dans la même section.
  const seen = new Set<string>();
  for (const l of items) {
    const key = `${l.parentId}:${l.designation.trim().toLowerCase()}:${normalizeUnit(l.unit)}`;
    if (seen.has(key)) checks.push({ severity: "mineure", point: "doublons", message: `Ligne en double : ${label(l)}`, lineId: l.id });
    seen.add(key);
  }
  for (const o of lines.filter((l) => l.kind === "option")) {
    if (!totals.lines[o.id]?.net) checks.push({ severity: "mineure", point: "prix", message: `Option sans montant : ${label(o)}`, lineId: o.id });
  }
  if (quote.taxRegime === "exoneration" && !quote.taxExemptionBasis?.trim()) checks.push({ severity: "bloquante", point: "taxes", message: "Exonération de TVA sans fondement légal : précisez le texte qui l’accorde." });
  if ((quote.taxRegime === "autoliquidation" || quote.taxRegime === "franchise") && country && country !== "FR") checks.push({ severity: "bloquante", point: "taxes", message: "Ce régime de TVA relève du code général des impôts français : il ne s’applique pas à une entité marocaine." });
  if (!quote.clientId && !quote.clientSnapshot) checks.push({ severity: "majeure", point: "references_documents", message: "Client non renseigné." });
  if (!quote.validityDays) checks.push({ severity: "majeure", point: "references_documents", message: "Durée de validité à préciser." });
  if (!quote.paymentTerms?.trim()) checks.push({ severity: "mineure", point: "references_documents", message: "Conditions de règlement non renseignées." });
  if (quote.depositRate && quote.depositAmount) checks.push({ severity: "majeure", point: "totaux", message: "Acompte défini deux fois, en taux et en montant : gardez l’un ou l’autre." });
  return checks;
}

/* ---------- Prix copiés dans le devis ---------- */

export type PriceItemRow = typeof schema.priceItem.$inferSelect;

/** Ligne de devis tirée d'un prix de la bibliothèque : valeur hors taxes au centime et copie figée de sa provenance. */
export async function lineFromPrice(price: PriceItemRow, sourceName: string | null, quoteCurrency: string): Promise<Pick<QuoteLineRow, "designation" | "unit" | "unitPrice" | "priceItemId" | "priceOrigin" | "priceSnapshot">> {
  if (price.currency !== quoteCurrency) throw new QuoteError(`Ce prix est en ${price.currency}, le devis en ${quoteCurrency}.`, 400);
  if (price.kind === "ratio") throw new QuoteError("Un ratio d’opération sert à l’estimation globale, jamais au prix d’une ligne de devis.", 400);
  if (price.archivedAt) throw new QuoteError("Ce prix est archivé.", 400);
  const ht = exclTax(price.unitPrice, price.taxBasis, price.vatRate);
  if (ht === null) throw new QuoteError("Ce prix TTC n’indique pas le taux de TVA qu’il inclut : il ne peut pas être ramené hors taxes.", 400);
  const { stalePriceMonths } = await readSetting("alertes");
  const snapshot: QuotePriceSnapshot = {
    designation: price.designation,
    unitPrice: price.unitPrice,
    unitPriceHt: ht,
    taxBasis: price.taxBasis,
    currency: price.currency,
    priceDate: price.priceDate,
    period: price.period,
    sourceName,
    reliability: price.reliability,
    verificationStatus: price.verificationStatus,
    historical: isHistoricalPrice(price, stalePriceMonths),
    regulated: price.regulated,
  };
  const when = price.period ? `valeur ${price.period}` : `du ${price.priceDate.split("-").reverse().join("/")}`;
  return {
    designation: price.designation,
    unit: price.unit,
    unitPrice: new Dec(ht).toDecimalPlaces(2).toFixed(2),
    priceItemId: price.id,
    priceOrigin: `Bibliothèque : ${sourceName ?? PRICE_ORIGIN_LABELS[price.origin]}, ${when}`.slice(0, 300),
    priceSnapshot: snapshot,
  };
}

/* ---------- Création ---------- */

export interface QuoteCreateInput {
  mode: QuoteSource;
  title?: string | null;
  projectId?: string | null;
  clientId?: string | null;
  dpgfId?: string | null;
  /** Plusieurs DPGF de la même affaire (un lot chacune) : une section par DPGF. */
  dpgfIds?: string[];
  lotIds?: string[];
  priceItemIds?: string[];
  companyProfileId?: string | null;
}

async function companyFor(db: Database, companyProfileId: string | null | undefined, country: string | null) {
  if (companyProfileId) {
    const [chosen] = await db.select().from(schema.companyProfile).where(eq(schema.companyProfile.id, companyProfileId));
    if (!chosen) throw new QuoteError("Entité émettrice introuvable.", 400);
    return chosen;
  }
  const all = await db.select().from(schema.companyProfile).orderBy(desc(schema.companyProfile.isDefault), asc(schema.companyProfile.createdAt));
  return (country ? all.find((c) => c.country === country) : null) ?? all[0] ?? null;
}

type NewLine = Omit<typeof schema.quoteLine.$inferInsert, "quoteId" | "position"> & { key?: string; parentKey?: string };

/** Insère des lignes dans l'ordre, sections d'abord rattachées par clé. */
async function insertLines(db: Database, quoteId: string, lines: NewLine[], start = 0): Promise<void> {
  const ids = new Map<string, string>();
  let position = start;
  for (const { key, parentKey, ...line } of lines) {
    const [row] = await db
      .insert(schema.quoteLine)
      .values({ ...line, quoteId, position: position++, parentId: parentKey ? (ids.get(parentKey) ?? null) : (line.parentId ?? null) })
      .returning({ id: schema.quoteLine.id });
    if (key) ids.set(key, row!.id);
  }
}

async function projectLots(db: Database, projectId: string, lotIds: string[] | undefined) {
  const lots = await db.select().from(schema.projectLot).where(eq(schema.projectLot.projectId, projectId)).orderBy(asc(schema.projectLot.position), asc(schema.projectLot.code));
  if (!lotIds?.length) return lots;
  const chosen = lots.filter((l) => lotIds.includes(l.id));
  if (chosen.length !== lotIds.length) throw new QuoteError("Un des lots choisis n’appartient pas à cette affaire.", 400);
  return chosen;
}

/** Lignes d'une DPGF : chapitres et sous-chapitres en sections, postes en lignes, prix et quantités repris avec leur provenance. */
async function linesFromDpgf(db: Database, dpgfId: string, lotFilter: Set<string> | null): Promise<{ lines: NewLine[]; dpgf: typeof schema.dpgf.$inferSelect }> {
  const [doc] = await db.select().from(schema.dpgf).where(eq(schema.dpgf.id, dpgfId));
  if (!doc) throw new QuoteError("DPGF introuvable.", 400);
  if (lotFilter && doc.lotId && !lotFilter.has(doc.lotId)) throw new QuoteError("Cette DPGF ne porte pas sur les lots choisis.", 400);
  const source = await db.select().from(schema.dpgfLine).where(eq(schema.dpgfLine.dpgfId, dpgfId)).orderBy(asc(schema.dpgfLine.position));
  const day = new Date(doc.updatedAt).toISOString().slice(0, 10);
  const lines: NewLine[] = source.map((l) =>
    l.kind === "poste"
      ? {
          key: l.id,
          parentKey: l.parentId ?? undefined,
          kind: "ligne" as const,
          designation: l.designation,
          description: l.description,
          unit: l.unit,
          quantity: l.quantity,
          unitPrice: l.unitPrice === null ? null : new Dec(l.unitPrice).toDecimalPlaces(2).toFixed(2),
          dpgfLineId: l.id,
          workItemId: l.workItemId,
          priceItemId: l.priceItemId,
          lotId: doc.lotId,
          priceOrigin: l.unitPrice === null ? null : `DPGF : ${l.priceSource ?? doc.title}`.slice(0, 300),
          priceSnapshot:
            l.unitPrice === null
              ? null
              : { designation: l.designation, unitPrice: l.unitPrice, unitPriceHt: l.unitPrice, taxBasis: "HT", currency: doc.currency, priceDate: day, period: null, sourceName: doc.title, reliability: null, verificationStatus: l.status === "valide" ? "verifie" : "a_verifier", historical: false, regulated: false },
          quantitySource: l.quantitySource ?? (l.quantity === null ? null : "DPGF"),
        }
      : { key: l.id, parentKey: l.parentId ?? undefined, kind: "section" as const, designation: [l.code, l.designation].filter(Boolean).join(" "), lotId: doc.lotId },
  );
  return { lines, dpgf: doc };
}

/** Lignes du métré : un ouvrage par ligne, sa quantité totale et sa provenance ; aucun prix (à établir). */
async function linesFromMetre(db: Database, projectId: string, lots: Array<typeof schema.projectLot.$inferSelect>): Promise<NewLine[]> {
  const items = await db
    .select()
    .from(schema.workItem)
    .where(and(eq(schema.workItem.projectId, projectId), lots.length ? inArray(schema.workItem.lotId, lots.map((l) => l.id)) : undefined))
    .orderBy(asc(schema.workItem.code), asc(schema.workItem.designation));
  const lines: NewLine[] = [];
  const groups = lots.length ? lots.map((lot) => ({ lot, items: items.filter((i) => i.lotId === lot.id) })) : [{ lot: null, items }];
  for (const { lot, items: group } of groups) {
    if (group.length === 0) continue;
    if (lot) lines.push({ key: `lot:${lot.id}`, kind: "section", designation: lotLabel(lot), lotId: lot.id, lotLabel: lotLabel(lot) });
    for (const item of group) {
      const metre = item.unit ? await metreQuantity(db, item.id, item.unit) : null;
      lines.push({
        parentKey: lot ? `lot:${lot.id}` : undefined,
        kind: "ligne",
        designation: item.designation,
        description: item.description,
        unit: item.unit,
        quantity: metre?.quantity ?? null,
        quantitySource: metre ? metre.source : "À métrer : aucune mesure dans l’unité de l’ouvrage",
        workItemId: item.id,
        lotId: item.lotId,
      });
    }
  }
  return lines;
}

export async function createQuote(db: Database, input: QuoteCreateInput): Promise<QuoteRow> {
  const project = input.projectId ? (await db.select().from(schema.project).where(eq(schema.project.id, input.projectId)))[0] : null;
  if (input.projectId && !project) throw new QuoteError("Affaire introuvable.", 400);
  if ((input.mode === "projet" || input.mode === "metre") && !project) throw new QuoteError("Choisissez l’affaire du devis.", 400);
  if (input.mode === "dpgf" && !input.dpgfId && !input.dpgfIds?.length) throw new QuoteError("Choisissez la DPGF du devis.", 400);
  if (input.mode === "bibliotheque" && !input.priceItemIds?.length) throw new QuoteError("Choisissez au moins un prix de la bibliothèque.", 400);

  let dpgfLines: NewLine[] = [];
  let dpgfDoc: typeof schema.dpgf.$inferSelect | null = null;
  let dpgfCount = 0;
  let mixedVat = false;
  let projectRow = project ?? null;
  if (input.mode === "dpgf") {
    const lots = input.lotIds?.length ? new Set(input.lotIds) : null;
    const ids = input.dpgfIds?.length ? [...new Set(input.dpgfIds)] : [input.dpgfId!];
    const loaded: Array<Awaited<ReturnType<typeof linesFromDpgf>>> = [];
    for (const id of ids) loaded.push(await linesFromDpgf(db, id, lots));
    dpgfDoc = loaded[0]!.dpgf;
    dpgfCount = loaded.length;
    if (loaded.some((x) => x.dpgf.projectId !== dpgfDoc!.projectId)) throw new QuoteError("Les DPGF choisies appartiennent à des affaires différentes.", 400);
    if (loaded.some((x) => x.dpgf.currency !== dpgfDoc!.currency)) throw new QuoteError("Les DPGF choisies sont établies dans des devises différentes.", 400);
    if (loaded.length === 1) dpgfLines = loaded[0]!.lines;
    else {
      // Une section par DPGF, au nom de son lot ; chaque ligne garde le taux de TVA de sa DPGF s'ils diffèrent.
      const lotRows = await db.select().from(schema.projectLot).where(eq(schema.projectLot.projectId, dpgfDoc.projectId));
      const rate = (v: string | null) => (v === null ? null : Number(v));
      mixedVat = loaded.some((x) => rate(x.dpgf.vatRate) !== rate(dpgfDoc!.vatRate));
      for (const { dpgf, lines } of loaded) {
        const lot = lotRows.find((l) => l.id === dpgf.lotId);
        const key = `dpgf:${dpgf.id}`;
        dpgfLines.push({ key, kind: "section", designation: lot ? lotLabel(lot) : dpgf.title, lotId: dpgf.lotId, lotLabel: lot ? lotLabel(lot) : null });
        dpgfLines.push(...lines.map((l) => ({ ...l, parentKey: l.parentKey ?? key, ...(mixedVat && l.kind === "ligne" ? { vatRate: dpgf.vatRate } : {}) })));
      }
    }
    if (!projectRow) projectRow = (await db.select().from(schema.project).where(eq(schema.project.id, dpgfDoc.projectId)))[0] ?? null;
  }
  const company = await companyFor(db, input.companyProfileId, projectRow?.country ?? null);
  const currency = dpgfDoc?.currency ?? projectRow?.currency ?? company?.defaultCurrency ?? null;
  if (!currency) throw new QuoteError("Devise inconnue : renseignez une entité émettrice ou choisissez une affaire.", 400);
  const lots = projectRow && (input.mode === "projet" || input.mode === "metre" || input.lotIds?.length) ? await projectLots(db, projectRow.id, input.lotIds) : [];
  const rates = await readSetting("chiffrage");
  const clientId = input.clientId ?? projectRow?.clientId ?? null;
  const number = await nextReference(db, "quote", "DEV");
  const title = input.title?.trim() || (projectRow ? (lots.length === 1 ? `${projectRow.name}, ${lotLabel(lots[0]!)}` : projectRow.name) : "Devis");
  const [quote] = await db
    .insert(schema.quote)
    .values({
      number,
      projectId: projectRow?.id ?? null,
      clientId,
      companyProfileId: company?.id ?? null,
      title: title.slice(0, 300),
      siteName: projectRow?.name ?? null,
      siteAddress: projectRow ? [projectRow.siteAddress, projectRow.city].filter(Boolean).join(", ") || null : null,
      currency,
      vatRate: mixedVat ? null : (dpgfDoc?.vatRate ?? company?.defaultVatRate ?? null),
      paymentTerms: company?.paymentTerms ?? null,
      legalMentions: company?.quoteLegalMentions ?? null,
      source: input.mode,
      dpgfId: dpgfDoc?.id ?? null,
      lotIds: lots.map((l) => l.id),
      overheadRate: rates.overheadRate || null,
      overheadBase: rates.overheadBase,
      contingencyRate: rates.contingencyRate || null,
      contingencyBase: rates.contingencyBase,
      marginRate: rates.marginRate || null,
      marginMode: rates.marginMode,
    })
    .returning();

  let lines: NewLine[] = [];
  if (input.mode === "dpgf") lines = dpgfLines;
  else if (input.mode === "metre") lines = await linesFromMetre(db, projectRow!.id, lots);
  else if (input.mode === "projet") lines = lots.map((lot) => ({ kind: "section" as const, designation: lotLabel(lot), lotId: lot.id, lotLabel: lotLabel(lot) }));
  else if (input.mode === "bibliotheque") {
    const prices = await db
      .select({ price: schema.priceItem, sourceName: schema.priceSource.name })
      .from(schema.priceItem)
      .leftJoin(schema.priceSource, eq(schema.priceSource.id, schema.priceItem.sourceId))
      .where(inArray(schema.priceItem.id, input.priceItemIds!));
    for (const id of input.priceItemIds!) {
      const found = prices.find((p) => p.price.id === id);
      if (!found) throw new QuoteError("Un des prix choisis est introuvable.", 400);
      lines.push({ kind: "ligne", ...(await lineFromPrice(found.price, found.sourceName, currency)), quantitySource: "À préciser" });
    }
  }
  if (lines.length) await insertLines(db, quote!.id, lines);
  await db.insert(schema.quoteEvent).values({ quoteId: quote!.id, kind: "creation", note: `${input.mode === "vierge" ? "Devis vierge" : `Créé ${{ projet: "depuis l’affaire", dpgf: dpgfCount > 1 ? `depuis ${dpgfCount} DPGF` : "depuis la DPGF", metre: "depuis le métré", bibliotheque: "depuis la bibliothèque", ia: "pour l’IA", vierge: "" }[input.mode]}`}${lots.length ? `, ${lots.map((l) => `lot ${l.code}`).join(", ")}` : ""}` });
  await recomputeQuote(db, quote!.id);
  return (await loadQuote(db, quote!.id)).quote;
}

/* ---------- Statuts, versions, duplication ---------- */

export type QuoteAction = "soumettre" | "valider" | "rouvrir" | "envoyer" | "relancer" | "accepter" | "refuser" | "nouvelle-version" | "archiver" | "restaurer";

/** Copie complète d'un devis à un instant donné : en-tête, lignes, totaux, émetteur et client. */
async function snapshotOf(db: Database, quote: QuoteRow, lines: QuoteLineRow[]) {
  const [company] = quote.companyProfileId ? await db.select().from(schema.companyProfile).where(eq(schema.companyProfile.id, quote.companyProfileId)) : [];
  const [client] = quote.clientId ? await db.select().from(schema.client).where(eq(schema.client.id, quote.clientId)) : [];
  return { quote, lines, issuer: quote.issuerSnapshot ?? company ?? null, client: quote.clientSnapshot ?? client ?? null };
}

export async function transitionQuote(db: Database, id: string, action: QuoteAction, note: string | null = null): Promise<QuoteRow> {
  const { quote, lines } = await loadQuote(db, id);
  const set = async (values: Partial<typeof schema.quote.$inferInsert>, kind: (typeof schema.quoteEvent.$inferInsert)["kind"], eventNote: string | null) => {
    await db.update(schema.quote).set(values).where(eq(schema.quote.id, id));
    await db.insert(schema.quoteEvent).values({ quoteId: id, kind, note: eventNote ?? note });
  };
  const country = quote.companyProfileId ? ((await db.select({ country: schema.companyProfile.country }).from(schema.companyProfile).where(eq(schema.companyProfile.id, quote.companyProfileId)))[0]?.country ?? null) : null;
  const blocking = async (levels: Array<QuoteCheck["severity"]>) => {
    const checks = quoteChecks(quote, lines, await recomputeQuote(db, id), country).filter((c) => levels.includes(c.severity));
    if (checks.length) throw new QuoteError(`${checks.length} point(s) à régler avant cette étape : ${checks.slice(0, 3).map((c) => c.message).join(" ; ")}${checks.length > 3 ? "…" : ""}`);
  };
  if (action === "archiver") {
    if (quote.archivedAt) throw new QuoteError("Ce devis est déjà archivé.");
    await set({ archivedAt: new Date() }, "archivage", null);
  } else if (action === "restaurer") {
    if (!quote.archivedAt) throw new QuoteError("Ce devis n’est pas archivé.");
    await set({ archivedAt: null }, "restauration", null);
  } else {
    if (quote.archivedAt) throw new QuoteError("Ce devis est archivé : restaurez-le d’abord.");
    switch (action) {
      case "soumettre":
        if (quote.status !== "brouillon") throw new QuoteError("Seul un brouillon se soumet à vérification.");
        await blocking(["bloquante"]);
        await set({ status: "a_verifier" }, "modification", "Soumis à vérification");
        break;
      case "valider":
        if (quote.status !== "brouillon" && quote.status !== "a_verifier") throw new QuoteError("Ce devis ne peut pas être déclaré prêt à envoyer.");
        await blocking(["bloquante", "majeure"]);
        await set({ status: "valide" }, "validation", "Prêt à envoyer");
        break;
      case "rouvrir":
        if (quote.status !== "a_verifier" && quote.status !== "valide") throw new QuoteError("Seul un devis à vérifier ou prêt à envoyer se rouvre en brouillon.");
        await set({ status: "brouillon" }, "modification", "Rouvert en brouillon");
        break;
      case "envoyer": {
        if (quote.status !== "valide") throw new QuoteError("Un devis doit être prêt à envoyer avant d’être marqué envoyé.");
        await blocking(["bloquante", "majeure"]);
        const now = new Date();
        const issueDate = quote.issueDate ?? now.toISOString().slice(0, 10);
        const version = quote.currentVersion + 1;
        const fresh = { ...quote, issueDate, currentVersion: version };
        const snap = await snapshotOf(db, fresh, lines);
        await db.insert(schema.quoteVersion).values({ quoteId: id, version, status: "envoye", label: `Version ${version} envoyée le ${now.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}`, snapshot: snap });
        await set({ status: "envoye", sentAt: now, lockedAt: now, issueDate, currentVersion: version, issuerSnapshot: snap.issuer, clientSnapshot: snap.client }, "envoi", note ?? `Version ${version}`);
        break;
      }
      case "relancer":
        if (quote.status !== "envoye") throw new QuoteError("Seul un devis envoyé se relance.");
        await db.insert(schema.quoteEvent).values({ quoteId: id, kind: "relance", note });
        break;
      case "accepter":
      case "refuser":
        if (quote.status !== "envoye") throw new QuoteError("Seul un devis envoyé peut être accepté ou refusé.");
        await set({ status: action === "accepter" ? "accepte" : "refuse" }, action === "accepter" ? "acceptation" : "refus", note);
        break;
      case "nouvelle-version": {
        if (EDITABLE.includes(quote.status) && !quote.lockedAt) throw new QuoteError("Ce devis se modifie encore : une nouvelle version n’est utile qu’après l’envoi.");
        await set({ status: "brouillon", lockedAt: null, sentAt: null }, "nouvelle_version", `Nouvelle version préparée après la version ${quote.currentVersion}`);
        break;
      }
    }
  }
  return (await loadQuote(db, id)).quote;
}

/** Devis envoyés dont la durée de validité est dépassée : passés au statut expiré, avec un événement. */
export async function expireQuotes(db: Database, today = new Date()): Promise<number> {
  const day = today.toISOString().slice(0, 10);
  const due = await db
    .select({ id: schema.quote.id })
    .from(schema.quote)
    .where(and(eq(schema.quote.status, "envoye"), isNull(schema.quote.archivedAt), sql`${schema.quote.issueDate} is not null and ${schema.quote.validityDays} is not null`, lt(sql`(${schema.quote.issueDate} + ${schema.quote.validityDays} * interval '1 day')::date`, sql`${day}::date`)));
  for (const { id } of due) {
    await db.update(schema.quote).set({ status: "expire" }).where(eq(schema.quote.id, id));
    await db.insert(schema.quoteEvent).values({ quoteId: id, kind: "expiration", note: "Durée de validité dépassée" });
  }
  return due.length;
}

/** Nouveau devis identique, nouveau numéro, en brouillon ; versions, verrou et copies figées non repris. */
export async function duplicateQuote(db: Database, id: string): Promise<QuoteRow> {
  const { quote, lines } = await loadQuote(db, id);
  const number = await nextReference(db, "quote", "DEV");
  const {
    id: _id,
    number: _n,
    createdAt: _c,
    updatedAt: _u,
    status: _s,
    lockedAt: _l,
    sentAt: _se,
    currentVersion: _v,
    issuerSnapshot: _is,
    clientSnapshot: _cs,
    archivedAt: _a,
    issueDate: _d,
    generationJobId: _g,
    ...fields
  } = quote;
  const [copy] = await db.insert(schema.quote).values({ ...fields, number, title: `${quote.title}`.slice(0, 300) }).returning();
  const ids = new Map<string, string>();
  for (const line of lines) {
    const { id: lineId, quoteId: _q, createdAt: _lc, updatedAt: _lu, parentId, ...rest } = line;
    const [row] = await db
      .insert(schema.quoteLine)
      .values({ ...rest, quoteId: copy!.id, parentId: parentId ? (ids.get(parentId) ?? null) : null })
      .returning({ id: schema.quoteLine.id });
    ids.set(lineId, row!.id);
  }
  await db.insert(schema.quoteEvent).values([
    { quoteId: copy!.id, kind: "duplication", note: `Copie du devis ${quote.number}` },
    { quoteId: id, kind: "duplication", note: `Copié dans le devis ${number}` },
  ]);
  await recomputeQuote(db, copy!.id);
  return (await loadQuote(db, copy!.id)).quote;
}
