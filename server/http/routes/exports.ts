/**
 * Téléchargements : chaque document dans ses formats natifs et en PDF, version claire (par défaut,
 * impression) ou sombre (présentation) ; versions figées ; dossier complet en ZIP ; bibliothèque de prix.
 * Réservé à l'administration ; jamais mis en cache.
 */
import type { Context } from "hono";
import { Hono } from "hono";
import { COUNTRIES, type Country, CURRENCIES, type Currency, PRICE_KINDS, type PriceKind } from "../../../shared/enums.js";
import type { AdminEnv } from "../../auth/guard.js";
import { getDb } from "../../db/index.js";
import type { DocTheme } from "../../documents/brand.js";
import { CONTENT_TYPES, type ExportFormat, type ExportResult, FORMATS, ID_SCOPE, renderExport, renderLibrary, renderVersion, UnsupportedFormat } from "../../documents/registry.js";
import { ExportNotFound } from "../../documents/context.js";
import type { DocumentKind } from "../../documents/model.js";
import { buildDossier } from "../../documents/zip.js";
import { auditAction } from "../../services/audit.js";
import { notFound, ValidationError } from "../validate.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function themeOf(c: Context): DocTheme {
  return c.req.query("theme") === "sombre" ? "sombre" : "clair";
}

export function download(result: Pick<ExportResult, "buffer" | "fileName" | "contentType">): Response {
  const ascii = result.fileName.normalize("NFKD").replace(/[^\x20-\x7e]/g, "").replace(/["\\]/g, "") || "document";
  return new Response(new Uint8Array(result.buffer), {
    headers: {
      "content-type": result.contentType,
      "content-disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(result.fileName)}`,
      "cache-control": "private, no-store",
    },
  });
}

async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ExportNotFound) notFound(error.message);
    if (error instanceof UnsupportedFormat) throw new ValidationError({ format: error.message });
    throw error;
  }
}

/** Rendu commun aux routes d'export, avec journal et erreurs explicites. */
export async function exportResponse(c: Context<AdminEnv>, kind: Exclude<DocumentKind, "bibliotheque">, id: string, format: ExportFormat): Promise<Response> {
  const db = await getDb();
  const lotId = c.req.query("lot");
  const result = await guarded(() => renderExport(db, kind, id, format, themeOf(c), { lotId: lotId && UUID.test(lotId) ? lotId : null }));
  await auditAction(c, `${kind}.export`, "project", result.projectId ?? id, { document: result.title, format, theme: themeOf(c) });
  return download(result);
}

export const exportRoutes = new Hono<AdminEnv>()
  .get("/formats", (c) => c.json({ formats: FORMATS, scopes: ID_SCOPE }))
  .get("/bibliotheque/:format", async (c) => {
    const db = await getDb();
    const q = c.req.query();
    const pick = <T extends string>(value: string | undefined, allowed: readonly T[]) => (value && (allowed as readonly string[]).includes(value) ? (value as T) : null);
    const filters = {
      q: q.q?.trim().slice(0, 200) || null,
      country: pick<Country>(q.pays, COUNTRIES),
      currency: pick<Currency>(q.devise, CURRENCIES),
      kind: pick<PriceKind>(q.nature, PRICE_KINDS),
      status: pick(q.statut, ["a_verifier", "verifie", "rejete"] as const),
      archived: q.archives === "1",
    };
    const result = await guarded(() => renderLibrary(db, filters, c.req.param("format") as ExportFormat, themeOf(c)));
    await auditAction(c, "bibliotheque.export", "price_item", null, { format: c.req.param("format"), filtres: filters });
    return download(result);
  })
  .get("/version/:id/:format", async (c) => {
    const id = c.req.param("id");
    if (!UUID.test(id)) notFound("Version introuvable.");
    const db = await getDb();
    const result = await guarded(() => renderVersion(db, id, c.req.param("format") as ExportFormat, themeOf(c)));
    await auditAction(c, "version.export", "project", result.projectId ?? id, { document: result.title, format: c.req.param("format") });
    return download(result);
  })
  .get("/dossier/:projectId", async (c) => {
    const projectId = c.req.param("projectId");
    if (!UUID.test(projectId)) notFound("Affaire introuvable.");
    const db = await getDb();
    const result = await guarded(async () => {
      try {
        return await buildDossier(db, projectId, themeOf(c));
      } catch (error) {
        if (error instanceof Error && error.message === "Affaire introuvable.") throw new ExportNotFound(error.message);
        throw error;
      }
    });
    await auditAction(c, "dossier.export", "project", projectId, { fichiers: result.files, echecs: result.failures.length, theme: themeOf(c) });
    return download({ buffer: result.buffer, fileName: result.fileName, contentType: CONTENT_TYPES.zip });
  })
  .get("/:kind/:id/:format", async (c) => {
    const kind = c.req.param("kind") as Exclude<DocumentKind, "bibliotheque">;
    const id = c.req.param("id");
    if (!(kind in ID_SCOPE)) notFound("Type de document inconnu.");
    if (!UUID.test(id)) notFound("Document introuvable.");
    return exportResponse(c, kind, id, c.req.param("format") as ExportFormat);
  });
