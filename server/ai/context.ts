/**
 * Contexte d'affaire transmis aux agents de rédaction : uniquement des données réelles de la base
 * (affaire, client, lot, ouvrages et quantités, planches lues, références du référentiel).
 */
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { COUNTRY_LABELS, DESIGN_PHASE_LABELS, MARKET_TYPE_LABELS, SECTOR_LABELS } from "../../shared/enums.js";
import { TRADE_FAMILIES } from "../../shared/trades.js";
import { type Database, schema } from "../db/index.js";
import type { PlanExtraction } from "./schemas.js";

export interface ProjectContext {
  affaire: Record<string, string | null>;
  client: { nom: string; secteur: string } | null;
  lot: { code: string; nom: string; famille: string; sousFamilles: string[] } | null;
  ouvrages: Array<{ code: string | null; designation: string; unite: string | null; localisation: string | null; caracteristiques: string[]; quantites: string[] }>;
  planches: Array<{ titre: string | null; nature: string; niveau: string | null; echelle: string | null; notes: string[] }>;
}

export async function projectContext(db: Database, projectId: string, lotId: string | null, options: { withMetre: boolean }): Promise<ProjectContext> {
  const [row] = await db.select({ project: schema.project, client: schema.client }).from(schema.project).leftJoin(schema.client, eq(schema.client.id, schema.project.clientId)).where(eq(schema.project.id, projectId));
  if (!row) throw new Error("Affaire introuvable.");
  const p = row.project;
  const [lot] = lotId ? await db.select().from(schema.projectLot).where(eq(schema.projectLot.id, lotId)) : [];
  const family = lot ? TRADE_FAMILIES.find((f) => f.key === lot.tradeFamily) : undefined;

  let ouvrages: ProjectContext["ouvrages"] = [];
  let planches: ProjectContext["planches"] = [];
  if (options.withMetre) {
    const items = await db
      .select()
      .from(schema.workItem)
      .where(and(eq(schema.workItem.projectId, projectId), lot ? eq(schema.workItem.lotId, lot.id) : undefined))
      .orderBy(asc(schema.workItem.code));
    const measures = items.length
      ? await db
          .select()
          .from(schema.measurement)
          .where(and(inArray(schema.measurement.workItemId, items.map((i) => i.id)), ne(schema.measurement.status, "rejete")))
      : [];
    ouvrages = items.map((i) => ({
      code: i.code,
      designation: i.designation,
      unite: i.unit,
      localisation: i.location,
      caracteristiques: i.attributes.map((a) => `${a.name} : ${a.value}`),
      quantites: measures
        .filter((m) => m.workItemId === i.id && m.quantity !== null)
        .map((m) => `${m.label} : ${m.quantity} ${m.unit} (${m.status === "verifie" ? "vérifiée" : "à vérifier"})`),
    }));
    const drawings = await db.select().from(schema.drawing).where(eq(schema.drawing.projectId, projectId));
    planches = drawings
      .filter((d) => d.extraction && (d.extraction as PlanExtraction).sheet.readable)
      .map((d) => ({ titre: d.title, nature: d.kind, niveau: d.level, echelle: d.scaleText, notes: ((d.extraction as PlanExtraction).notes ?? []).slice(0, 10) }));
  }

  return {
    affaire: {
      nom: p.name,
      reference: p.reference,
      pays: COUNTRY_LABELS[p.country],
      ville: p.city,
      typeDeMarche: MARKET_TYPE_LABELS[p.marketType],
      secteur: SECTOR_LABELS[p.sector],
      phase: DESIGN_PHASE_LABELS[p.designPhase],
      natureDesTravaux: p.worksNature,
      description: p.description,
      hypotheses: p.hypotheses,
      contraintes: p.constraints,
    },
    client: row.client ? { nom: row.client.name, secteur: SECTOR_LABELS[row.client.sector] } : null,
    lot: lot ? { code: lot.code, nom: lot.name, famille: family?.label ?? lot.tradeFamily, sousFamilles: family?.subFamilies ?? [] } : null,
    ouvrages,
    planches,
  };
}

/** Références autorisées pour une rédaction : celles choisies, existantes et non rejetées. */
export async function allowedReferences(db: Database, ids: string[]) {
  if (ids.length === 0) return [];
  const rows = await db.select().from(schema.technicalReference).where(and(inArray(schema.technicalReference.id, ids), ne(schema.technicalReference.verificationStatus, "rejete")));
  return rows.map((r) => ({ id: r.id, code: r.code, title: r.title, version: r.version, statut: r.verificationStatus === "verifie" ? "vérifiée" : "à vérifier" }));
}
