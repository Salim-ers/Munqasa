/**
 * Démonstration : de quoi essayer toute la chaîne sur des données réelles, sans rien inventer. Le
 * référentiel vérifié à la source est importé ; sur accord explicite, les prix publics de 2022 (moyennes
 * annuelles des matériaux de construction au Maroc, ministère chargé de l'habitat, datées du 1er juillet) sont admis dans les chiffrages
 * automatiques en portant l'ancienneté admise à 60 mois, toujours affichés « valeur 2022 » ; une affaire
 * par pays est créée avec ses lots. Aucune quantité ni aucun prix n'est saisi à la place de l'utilisateur :
 * les quantités viennent de ses plans ou de sa saisie.
 */
import { and, count, eq, gte, inArray, isNull, ne, sql } from "drizzle-orm";
import { COUNTRIES, type Country } from "../../shared/enums.js";
import { DEFAULT_LOTS } from "../../shared/lots.js";
import type { ProjectInput } from "../../shared/schemas.js";
import { type Database, schema } from "../db/index.js";
import { addProjectLots, ensureDefaultCatalogs, type LotSelection } from "./lot-catalog.js";
import { historicalLimit } from "./price-filters.js";
import { type CatalogImport, importReferenceCatalog, STARTER_CATALOG } from "./references-catalog.js";
import { nextReference } from "./references.js";
import { readSetting, writeSetting } from "./settings.js";

/** Ancienneté admise qui fait entrer les prix publics de 2022 dans les chiffrages automatiques, jusqu'en juillet 2027. */
export const DEMO_PRICE_MONTHS = 60;

/** Lots de chaque affaire de démonstration, pris dans la nomenclature par défaut. */
export const DEMO_LOTS = ["01", "11", "17", "20"];

type DemoProject = Required<Pick<ProjectInput, "name" | "country" | "city" | "marketType" | "sector" | "worksNature" | "designPhase" | "currency" | "description">>;

export const DEMO_PROJECTS: Record<Country, DemoProject> = {
  MA: {
    name: "Démonstration : immeuble d’habitation R+3 à Casablanca",
    country: "MA",
    city: "Casablanca",
    marketType: "consultation_privee",
    sector: "prive",
    worksNature: "Construction neuve",
    designPhase: "dce",
    currency: "MAD",
    description:
      "Affaire de démonstration. Immeuble d’habitation R+3 en béton armé : structure poteaux et poutres, planchers à corps creux, maçonnerie en agglomérés de ciment, menuiseries extérieures en aluminium, sols en carreaux de grès, plomberie en tubes PPR et appareils sanitaires.",
  },
  FR: {
    name: "Démonstration : logements collectifs R+2 à Lyon",
    country: "FR",
    city: "Lyon",
    marketType: "consultation_privee",
    sector: "prive",
    worksNature: "Construction neuve",
    designPhase: "dce",
    currency: "EUR",
    description:
      "Affaire de démonstration. Bâtiment de logements collectifs R+2 en béton armé : fondations superficielles, voiles et planchers en béton armé, maçonnerie en blocs de béton, menuiseries extérieures, carrelage collé, plomberie sanitaire.",
  },
};

const key = (scope: string, code: string) => `${scope}:${code.replace(/\s+/g, "").toUpperCase()}`;

/** Prix utilisables par les chiffrages automatiques d'un pays pour une ancienneté admise donnée. */
async function usablePrices(db: Database, months: number): Promise<Record<Country, number>> {
  const p = schema.priceItem;
  const rows = await db
    .select({ country: p.country, n: count() })
    .from(p)
    .where(and(isNull(p.archivedAt), ne(p.verificationStatus, "rejete"), ne(p.kind, "ratio"), eq(p.regulated, false), gte(p.priceDate, historicalLimit(months))))
    .groupBy(p.country);
  return Object.fromEntries(COUNTRIES.map((c) => [c, Number(rows.find((r) => r.country === c)?.n ?? 0)])) as Record<Country, number>;
}

export interface DemoStatus {
  references: { catalog: number; present: number; verified: number };
  prices: { months: number; target: number; usable: Record<Country, number>; usableAtTarget: Record<Country, number> };
  projects: Array<{ country: Country; name: string; id: string | null; reference: string | null; lots: number }>;
}

export async function demoStatus(db: Database): Promise<DemoStatus> {
  const r = schema.technicalReference;
  const [refs, alerts, demo] = await Promise.all([db.select({ scope: r.scope, code: r.code, status: r.verificationStatus }).from(r), readSetting("alertes"), readSetting("demonstration")]);
  const byKey = new Map(refs.map((ref) => [key(ref.scope, ref.code), ref.status]));
  const statuses = STARTER_CATALOG.map((item) => byKey.get(key(item.scope, item.code)));
  const ids = COUNTRIES.map((c) => demo.projects[c]).filter((id): id is string => Boolean(id));
  const projects = ids.length
    ? await db
        .select({ id: schema.project.id, reference: schema.project.reference, lots: sql<number>`(select count(*)::int from project_lot pl where pl.project_id = "project"."id")` })
        .from(schema.project)
        .where(inArray(schema.project.id, ids))
    : [];
  const [usable, usableAtTarget] = await Promise.all([usablePrices(db, alerts.stalePriceMonths), usablePrices(db, Math.max(alerts.stalePriceMonths, DEMO_PRICE_MONTHS))]);
  return {
    references: { catalog: STARTER_CATALOG.length, present: statuses.filter(Boolean).length, verified: statuses.filter((s) => s === "verifie").length },
    prices: { months: alerts.stalePriceMonths, target: DEMO_PRICE_MONTHS, usable, usableAtTarget },
    projects: COUNTRIES.map((country) => {
      const found = projects.find((p) => p.id === demo.projects[country]);
      return { country, name: DEMO_PROJECTS[country].name, id: found?.id ?? null, reference: found?.reference ?? null, lots: Number(found?.lots ?? 0) };
    }),
  };
}

/** Lots de démonstration : entrées de la nomenclature par défaut, ou lots de la nomenclature d'origine si elles ont été retirées. */
async function demoLots(db: Database): Promise<LotSelection[]> {
  await ensureDefaultCatalogs(db);
  const [catalog] = await db.select({ id: schema.lotCatalog.id }).from(schema.lotCatalog).where(eq(schema.lotCatalog.isDefault, true)).limit(1);
  const entries = catalog
    ? await db
        .select({ id: schema.lotCatalogEntry.id, number: schema.lotCatalogEntry.number })
        .from(schema.lotCatalogEntry)
        .where(and(eq(schema.lotCatalogEntry.catalogId, catalog.id), isNull(schema.lotCatalogEntry.parentId), inArray(schema.lotCatalogEntry.number, DEMO_LOTS)))
    : [];
  return DEMO_LOTS.flatMap((number): LotSelection[] => {
    const entry = entries.find((e) => e.number === number);
    if (entry) return [{ catalogEntryId: entry.id }];
    const lot = DEFAULT_LOTS.find((l) => l.number === number);
    return lot ? [{ code: lot.number, name: lot.name, tradeFamily: lot.tradeFamily }] : [];
  });
}

export interface DemoPreparation {
  references: CatalogImport;
  prices: { from: number; to: number } | null;
  projects: Array<{ country: Country; id: string; reference: string; name: string; created: boolean }>;
}

/**
 * Prépare la démonstration ; peut être relancée sans rien dupliquer. Une affaire de démonstration
 * supprimée entre-temps est recréée, une affaire existante n'est jamais modifiée.
 */
export async function prepareDemo(db: Database, options: { prices: boolean }): Promise<DemoPreparation> {
  const references = await importReferenceCatalog(db);

  let prices: DemoPreparation["prices"] = null;
  const alerts = await readSetting("alertes");
  if (options.prices && alerts.stalePriceMonths < DEMO_PRICE_MONTHS) {
    await writeSetting("alertes", { ...alerts, stalePriceMonths: DEMO_PRICE_MONTHS });
    prices = { from: alerts.stalePriceMonths, to: DEMO_PRICE_MONTHS };
  }

  const demo = await readSetting("demonstration");
  const lots = await demoLots(db);
  const projects: DemoPreparation["projects"] = [];
  for (const country of COUNTRIES) {
    const values = DEMO_PROJECTS[country];
    const id = demo.projects[country];
    const [existing] = id ? await db.select({ id: schema.project.id, reference: schema.project.reference, name: schema.project.name }).from(schema.project).where(eq(schema.project.id, id)) : [];
    if (existing) {
      projects.push({ country, ...existing, created: false });
      continue;
    }
    const reference = await nextReference(db, "project", "TAL");
    const [row] = await db
      .insert(schema.project)
      .values({ ...values, reference, lastOpenedAt: new Date() })
      .returning({ id: schema.project.id, reference: schema.project.reference, name: schema.project.name });
    await addProjectLots(db, row!.id, lots);
    demo.projects[country] = row!.id;
    projects.push({ country, ...row!, created: true });
  }
  await writeSetting("demonstration", demo);
  return { references, prices, projects };
}
