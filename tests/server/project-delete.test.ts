/**
 * Suppression définitive d'une affaire : confirmée par sa référence, refusée pendant un traitement actif,
 * documents, lots, échéances, traitements et fichiers effacés (fichiers retirés du stockage), devis conservés
 * et détachés, opération inscrite au journal, référence jamais réattribuée.
 */
import { eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import { setAiProviderForTests } from "../../server/ai/client.js";
import { fakeProvider } from "../../server/ai/fake.js";
import { schema } from "../../server/db/index.js";
import { runJob, setJobKickerForTests } from "../../server/jobs/runner.js";
import { getStorage } from "../../server/services/storage.js";
import { adminSession, setupTestServer, type TestBrowser } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof setupTestServer>>;
let admin: TestBrowser;

async function projectWithContent(name: string) {
  const created = await admin.request("/api/admin/projects", { body: { name, country: "MA", city: "Rabat", marketType: "appel_offres_ouvert", sector: "public", currency: "MAD" } });
  const project = created.json.project as { id: string; reference: string };
  const lot = (await admin.request(`/api/admin/projects/${project.id}/lots`, { body: { code: "01", name: "Gros œuvre", tradeFamily: "gros_oeuvre" } })).json.lot.id as string;
  const bytes = new Uint8Array(await (await PDFDocument.create()).save());
  const upload = await admin.request("/api/admin/files/upload-url", { body: { projectId: project.id, kind: "plan", fileName: "Plan.pdf", sizeBytes: bytes.byteLength, contentType: "application/pdf" } });
  await admin.request(upload.json.upload.url, { method: "PUT", raw: bytes, headers: { "content-type": "application/octet-stream" } });
  await admin.request(`/api/admin/files/${upload.json.file.id}/complete`, { body: {} });
  await admin.request(`/api/admin/projects/${project.id}/dossier/generate`, { body: { fileIds: [], lotId: null, lotIds: [lot], documents: ["cctp", "dpgf"], detailLevel: "synthetique", referenceIds: [], vatRate: "20", instructions: null, consent: true } });
  const quote = await admin.request("/api/admin/quotes", { body: { mode: "projet", projectId: project.id, title: `Devis ${name}` } });
  return { ...project, lot, fileId: upload.json.file.id as string, quoteId: quote.json.quote.id as string };
}

beforeAll(async () => {
  ctx = await setupTestServer();
  admin = (await adminSession(ctx.app)).browser;
  setJobKickerForTests(async (id) => {
    await runJob(id);
  });
  setAiProviderForTests(fakeProvider);
});

describe("suppression d'une affaire", () => {
  it("exige la référence de l'affaire pour confirmer", async () => {
    const p = await projectWithContent("Affaire à garder");
    const res = await admin.request(`/api/admin/projects/${p.id}`, { method: "DELETE", body: { confirmation: "TAL-0000-0000" } });
    expect(res.status).toBe(400);
    expect(res.json.fields.confirmation).toBe(`Saisissez exactement la référence ${p.reference} pour confirmer.`);
    expect(await ctx.db.select().from(schema.project).where(eq(schema.project.id, p.id))).toHaveLength(1);
    const missing = await admin.request("/api/admin/projects/7d0c4b8e-3d7a-4f5e-9a51-0c8a1f2b3c4d", { method: "DELETE", body: { confirmation: "x" } });
    expect(missing.status).toBe(404);
  });

  it("refuse pendant un traitement actif, accepte quand le traitement est arrêté", async () => {
    const p = await projectWithContent("Affaire en traitement");
    const [job] = await ctx.db.select().from(schema.generationJob).where(eq(schema.generationJob.projectId, p.id));
    await ctx.db.update(schema.generationJob).set({ status: "en_cours", lockedUntil: new Date(Date.now() + 60_000) }).where(eq(schema.generationJob.id, job!.id));
    const busy = await admin.request(`/api/admin/projects/${p.id}`, { method: "DELETE", body: { confirmation: p.reference } });
    expect(busy.status).toBe(409);
    expect(busy.json.message).toBe("Un traitement est en cours sur cette affaire : arrêtez-le ou attendez sa fin, puis supprimez l’affaire.");
    // Exécutant disparu (verrou expiré) : la suppression peut se faire.
    await ctx.db.update(schema.generationJob).set({ lockedUntil: new Date(Date.now() - 60_000) }).where(eq(schema.generationJob.id, job!.id));
    expect((await admin.request(`/api/admin/projects/${p.id}`, { method: "DELETE", body: { confirmation: p.reference } })).status).toBe(200);
  });

  it("efface l'affaire et ses fichiers, conserve les devis détachés, et l'inscrit au journal", async () => {
    const p = await projectWithContent("Affaire à supprimer");
    const [file] = await ctx.db.select().from(schema.sourceFile).where(eq(schema.sourceFile.id, p.fileId));
    const storage = await getStorage();
    expect(await storage.head(file!.storageKey)).not.toBeNull();
    expect((await ctx.db.select().from(schema.dpgf).where(eq(schema.dpgf.projectId, p.id))).length).toBeGreaterThan(0);

    // Référence saisie en minuscules : acceptée.
    const res = await admin.request(`/api/admin/projects/${p.id}`, { method: "DELETE", body: { confirmation: p.reference.toLowerCase() } });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ deleted: true, reference: p.reference, files: 1, quotesKept: 1 });

    expect(await ctx.db.select().from(schema.project).where(eq(schema.project.id, p.id))).toHaveLength(0);
    for (const table of [schema.projectLot, schema.cctpDocument, schema.dpgf, schema.sourceFile, schema.generationJob, schema.qualityIssue, schema.workItem] as const) {
      expect(await ctx.db.select().from(table).where(eq(table.projectId, p.id))).toHaveLength(0);
    }
    expect(await storage.head(file!.storageKey)).toBeNull();
    const [quote] = await ctx.db.select().from(schema.quote).where(eq(schema.quote.id, p.quoteId));
    expect(quote).toMatchObject({ projectId: null, title: "Devis Affaire à supprimer" });
    const [entry] = await ctx.db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "affaire.suppression"));
    expect(entry).toMatchObject({ entityId: expect.any(String) });
    expect(entry!.details).toMatchObject({ nom: expect.any(String), fichiersNonEffaces: 0 });
    expect((await admin.request(`/api/admin/projects/${p.id}`)).status).toBe(404);

    // La référence d'une affaire supprimée n'est jamais réattribuée.
    const next = await admin.request("/api/admin/projects", { body: { name: "Affaire suivante", country: "MA", marketType: "appel_offres_ouvert", sector: "public", currency: "MAD" } });
    expect(next.json.project.reference).not.toBe(p.reference);
    const numbers = [p.reference, next.json.project.reference].map((r: string) => Number(r.slice(-4)));
    expect(numbers[1]).toBeGreaterThan(numbers[0]!);
  });
});
