/**
 * Fichiers sources : téléversement en deux temps (demande signée → envoi direct → vérification),
 * liste, téléchargement temporaire, suppression sécurisée.
 */
import { createHash } from "node:crypto";
import { and, desc, eq, isNull, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { FILE_KINDS, type FileKind } from "../../../shared/enums.js";
import { MAX_UPLOAD_BYTES, uploadRequest } from "../../../shared/schemas.js";
import type { AdminEnv } from "../../auth/guard.js";
import { getDb, schema } from "../../db/index.js";
import { auditAction } from "../../services/audit.js";
import { checkFileSignature, isAllowedExtension, SIGNATURE_BYTES } from "../../services/file-check.js";
import { getStorage, storageKey } from "../../services/storage.js";
import { body, conflict, notFound, uuidParam, ValidationError } from "../validate.js";

const f = schema.sourceFile;
/** Au-delà, l'empreinte SHA-256 est calculée par un traitement de fond (étape C). */
const HASH_INLINE_MAX = 100 * 1024 * 1024;

async function sha256Of(stream: ReadableStream<Uint8Array>): Promise<string> {
  const hash = createHash("sha256");
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    hash.update(value);
  }
  return hash.digest("hex");
}

export const fileRoutes = new Hono<AdminEnv>()
  .get("/", async (c) => {
    const db = await getDb();
    const projectId = c.req.query("affaire");
    const kind = c.req.query("type");
    const filters: SQL[] = [isNull(f.deletedAt)];
    if (projectId && /^[0-9a-f-]{36}$/i.test(projectId)) filters.push(eq(f.projectId, projectId));
    else if (c.req.query("bibliotheque") === "1") filters.push(isNull(f.projectId));
    if (kind && (FILE_KINDS as readonly string[]).includes(kind)) filters.push(eq(f.kind, kind as FileKind));
    const rows = await db
      .select({
        id: f.id,
        projectId: f.projectId,
        kind: f.kind,
        originalName: f.originalName,
        mimeType: f.mimeType,
        sizeBytes: f.sizeBytes,
        sha256: f.sha256,
        status: f.status,
        error: f.error,
        uploadedAt: f.uploadedAt,
        createdAt: f.createdAt,
      })
      .from(f)
      .where(and(...filters))
      .orderBy(desc(f.createdAt))
      .limit(500);
    return c.json({ items: rows });
  })
  .post("/upload-url", async (c) => {
    const db = await getDb();
    const data = await body(c, uploadRequest);
    if (!isAllowedExtension(data.fileName)) throw new ValidationError({ fileName: "Format non accepté." });
    if (data.projectId) {
      const [project] = await db.select({ id: schema.project.id }).from(schema.project).where(eq(schema.project.id, data.projectId));
      if (!project) notFound("Affaire introuvable.");
    }
    const storage = await getStorage();
    const id = crypto.randomUUID();
    const key = storageKey(data.projectId, id, data.fileName);
    const [row] = await db
      .insert(f)
      .values({ id, projectId: data.projectId, kind: data.kind, originalName: data.fileName, mimeType: data.contentType, sizeBytes: data.sizeBytes, storageKey: key, status: "en_attente" })
      .returning();
    const url = await storage.uploadUrl(key, data.contentType);
    return c.json(
      {
        file: row,
        upload: url
          ? { method: "PUT", url, headers: { "content-type": data.contentType }, direct: true }
          : { method: "PUT", url: `/api/admin/files/${id}/content`, headers: { "content-type": "application/octet-stream" }, direct: false },
      },
      201,
    );
  })
  .put("/:id/content", async (c) => {
    // Développement uniquement : en production, le navigateur envoie directement au compartiment privé.
    const storage = await getStorage();
    if (storage.kind !== "local") return c.json({ error: "methode_non_autorisee", message: "Envoi direct au stockage attendu." }, 405);
    const db = await getDb();
    const id = uuidParam(c);
    const [row] = await db.select().from(f).where(eq(f.id, id));
    if (!row || row.status !== "en_attente") notFound("Téléversement introuvable ou déjà terminé.");
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.byteLength > MAX_UPLOAD_BYTES || bytes.byteLength !== row.sizeBytes) conflict("La taille reçue ne correspond pas à la taille annoncée.");
    await storage.put(row.storageKey, bytes, "application/octet-stream");
    return c.json({ ok: true });
  })
  .post("/:id/complete", async (c) => {
    const db = await getDb();
    const id = uuidParam(c);
    const [row] = await db.select().from(f).where(eq(f.id, id));
    if (!row) notFound("Fichier introuvable.");
    if (row.status !== "en_attente") return c.json({ file: row });
    const storage = await getStorage();
    const head = await storage.head(row.storageKey);
    if (!head) conflict("Le fichier n’a pas été reçu par le stockage.");
    const reject = async (reason: string) => {
      await storage.remove(row.storageKey);
      const [rejected] = await db.update(f).set({ status: "rejete", error: reason }).where(eq(f.id, id)).returning();
      await auditAction(c, "fichier.refuse", "project", row.projectId ?? id, { fichier: row.originalName, motif: reason });
      return c.json({ error: "fichier_refuse", message: reason, file: rejected }, 422);
    };
    if (head.size !== row.sizeBytes) return reject("La taille reçue ne correspond pas à la taille annoncée.");
    const check = await checkFileSignature(row.originalName, await storage.readStart(row.storageKey, SIGNATURE_BYTES));
    if (!check.ok) return reject(check.reason);
    const sha256 = head.size <= HASH_INLINE_MAX ? await sha256Of(await storage.readStream(row.storageKey)) : null;
    // Même contenu déjà présent dans l'affaire : on le signale, sans bloquer.
    let duplicateOf: string | null = null;
    if (sha256) {
      const [dup] = await db
        .select({ id: f.id, name: f.originalName })
        .from(f)
        .where(and(eq(f.sha256, sha256), isNull(f.deletedAt), row.projectId ? eq(f.projectId, row.projectId) : isNull(f.projectId)));
      duplicateOf = dup?.name ?? null;
    }
    const [done] = await db.update(f).set({ status: "verifie", mimeType: check.mime, sha256, uploadedAt: new Date(), error: null }).where(eq(f.id, id)).returning();
    await auditAction(c, "fichier.televerse", "project", row.projectId ?? id, { fichier: row.originalName, taille: head.size, type: check.mime });
    return c.json({ file: done, duplicateOf });
  })
  .get("/:id/download", async (c) => {
    const db = await getDb();
    const id = uuidParam(c);
    const [row] = await db.select().from(f).where(and(eq(f.id, id), isNull(f.deletedAt)));
    if (!row || row.status === "en_attente" || row.status === "rejete") notFound("Fichier introuvable.");
    const storage = await getStorage();
    const inline = c.req.query("apercu") === "1";
    await auditAction(c, "fichier.telechargement", "project", row.projectId ?? id, { fichier: row.originalName });
    const url = await storage.downloadUrl(row.storageKey, row.originalName, inline);
    if (url) return c.redirect(url, 302);
    const stream = await storage.readStream(row.storageKey);
    return new Response(stream, {
      headers: {
        "content-type": row.mimeType,
        "content-length": String(row.sizeBytes),
        "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(row.originalName)}`,
        "x-content-type-options": "nosniff",
        "cache-control": "private, no-store",
      },
    });
  })
  .delete("/:id", async (c) => {
    // Suppression sécurisée : l'objet est effacé du stockage ; la trace reste au journal.
    const db = await getDb();
    const id = uuidParam(c);
    const [row] = await db.select().from(f).where(and(eq(f.id, id), isNull(f.deletedAt)));
    if (!row) notFound("Fichier introuvable.");
    const storage = await getStorage();
    await storage.remove(row.storageKey);
    await db.update(f).set({ deletedAt: new Date(), status: "rejete", error: "Supprimé par l’administrateur." }).where(eq(f.id, id));
    await auditAction(c, "fichier.suppression", "project", row.projectId ?? id, { fichier: row.originalName });
    return c.json({ ok: true });
  });
