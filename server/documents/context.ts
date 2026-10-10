/** Contexte commun aux exports d'une affaire : affaire, maître d'ouvrage, lot, entité émettrice, identité documentaire. */
import { desc, eq } from "drizzle-orm";
import { COUNTRY_LABELS, DESIGN_PHASE_LABELS, type DocumentStatus } from "../../shared/enums.js";
import type { DocumentIdentity } from "../../shared/settings.js";
import { type Database, schema } from "../db/index.js";
import { readSetting } from "../services/settings.js";
import type { DocMeta, DocumentKind } from "./model.js";

export interface ExportContext {
  project: typeof schema.project.$inferSelect;
  client: typeof schema.client.$inferSelect | null;
  lot: typeof schema.projectLot.$inferSelect | null;
  company: typeof schema.companyProfile.$inferSelect | null;
  identity: DocumentIdentity;
}

export async function exportContext(db: Database, projectId: string, lotId: string | null = null): Promise<ExportContext> {
  const [[row], lots, [company], identity] = await Promise.all([
    db.select({ project: schema.project, client: schema.client }).from(schema.project).leftJoin(schema.client, eq(schema.client.id, schema.project.clientId)).where(eq(schema.project.id, projectId)),
    lotId ? db.select().from(schema.projectLot).where(eq(schema.projectLot.id, lotId)) : Promise.resolve([]),
    db.select().from(schema.companyProfile).orderBy(desc(schema.companyProfile.isDefault)).limit(1),
    readSetting("identite_documentaire"),
  ]);
  if (!row) throw new Error("Affaire introuvable.");
  return { project: row.project, client: row.client, lot: lots[0] ?? null, company: company ?? null, identity };
}

/** Statut lisible sur la couverture : jamais « conforme » ni « validé » sans validation enregistrée. */
export const COVER_STATUS: Record<DocumentStatus, string> = {
  brouillon: "Brouillon",
  en_generation: "En cours de génération",
  a_valider: "Document de travail, à valider",
  valide: "Validé",
  archive: "Archivé",
};

export function baseMeta(ctx: ExportContext, fields: { kind: DocumentKind; typeLabel: string; shortLabel: string; title: string; version: number | null; status: string; toc: boolean; orientation?: "portrait" | "landscape"; phase?: string | null; disclaimer?: string | null; date?: Date }): DocMeta {
  const p = ctx.project;
  return {
    kind: fields.kind,
    typeLabel: fields.typeLabel,
    shortLabel: fields.shortLabel,
    title: fields.title,
    project: {
      reference: p.reference,
      name: p.name,
      location: [p.city, COUNTRY_LABELS[p.country]].filter(Boolean).join(", ") || null,
      phase: fields.phase === undefined ? DESIGN_PHASE_LABELS[p.designPhase] : fields.phase,
    },
    client: ctx.client?.name ?? null,
    lot: ctx.lot ? `Lot ${ctx.lot.code}, ${ctx.lot.name}` : null,
    version: fields.version,
    date: fields.date ?? new Date(),
    status: fields.status,
    company: ctx.company?.legalName ?? null,
    footerText: ctx.identity.footerText,
    orientation: fields.orientation ?? "portrait",
    toc: fields.toc,
    disclaimer: fields.disclaimer ?? null,
  };
}

/** Nom de fichier lisible : « TAL-2026-0001 CCTP lot 01 Gros œuvre.pdf ». */
export function fileName(reference: string, title: string, extension: string): string {
  const base = `${reference} ${title}`.replace(/[^\p{L}\p{N} ._-]+/gu, " ").replace(/\s+/g, " ").trim();
  return `${base}.${extension}`;
}

const rateFmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 });
/** Taux lisible : « 20 % », « 5,5 % » (jamais « 20,0000 % »). */
export function percentLabel(rate: string | number): string {
  return `${rateFmt.format(Number(rate))} %`;
}

const moneyFmt = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtyFmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 });
export const money = (value: string | number | null, currency: string) => (value === null || value === "" ? "" : `${moneyFmt.format(Number(value))} ${currency}`);
export const quantity = (value: string | number | null) => (value === null || value === "" ? "" : qtyFmt.format(Number(value)));

/** Document demandé introuvable : la route répond 404. */
export class ExportNotFound extends Error {}
