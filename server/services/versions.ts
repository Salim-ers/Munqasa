/** Versions figées des documents : instantané complet, numéroté, jamais modifié après création. */
import { and, asc, eq, max } from "drizzle-orm";
import type { DocumentType } from "../../shared/enums.js";
import { type Database, schema } from "../db/index.js";

async function nextVersion(db: Database, documentType: DocumentType, documentId: string): Promise<number> {
  const [row] = await db
    .select({ v: max(schema.documentVersion.version) })
    .from(schema.documentVersion)
    .where(and(eq(schema.documentVersion.documentType, documentType), eq(schema.documentVersion.documentId, documentId)));
  return (row?.v ?? 0) + 1;
}

export async function snapshotCctp(db: Database, documentId: string, note: string, validated = false): Promise<number> {
  const [document] = await db.select().from(schema.cctpDocument).where(eq(schema.cctpDocument.id, documentId));
  if (!document) throw new Error("CCTP introuvable.");
  const sections = await db.select().from(schema.cctpSection).where(eq(schema.cctpSection.documentId, documentId)).orderBy(asc(schema.cctpSection.position));
  const version = await nextVersion(db, "cctp", documentId);
  await db.insert(schema.documentVersion).values({ projectId: document.projectId, documentType: "cctp", documentId, version, snapshot: { document, sections }, note, validated });
  await db.update(schema.cctpDocument).set({ currentVersion: version }).where(eq(schema.cctpDocument.id, documentId));
  return version;
}

export async function snapshotDpgf(db: Database, dpgfId: string, note: string, validated = false): Promise<number> {
  const [document] = await db.select().from(schema.dpgf).where(eq(schema.dpgf.id, dpgfId));
  if (!document) throw new Error("DPGF introuvable.");
  const lines = await db.select().from(schema.dpgfLine).where(eq(schema.dpgfLine.dpgfId, dpgfId)).orderBy(asc(schema.dpgfLine.position));
  const version = await nextVersion(db, "dpgf", dpgfId);
  await db.insert(schema.documentVersion).values({ projectId: document.projectId, documentType: "dpgf", documentId: dpgfId, version, snapshot: { document, lines }, note, validated });
  await db.update(schema.dpgf).set({ currentVersion: version }).where(eq(schema.dpgf.id, dpgfId));
  return version;
}

export async function listVersions(db: Database, documentType: DocumentType, documentId: string) {
  return db
    .select({ id: schema.documentVersion.id, version: schema.documentVersion.version, note: schema.documentVersion.note, validated: schema.documentVersion.validated, createdAt: schema.documentVersion.createdAt })
    .from(schema.documentVersion)
    .where(and(eq(schema.documentVersion.documentType, documentType), eq(schema.documentVersion.documentId, documentId)))
    .orderBy(asc(schema.documentVersion.version));
}
