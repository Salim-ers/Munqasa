/**
 * Référentiel et agent de rédaction du CCTP (fournisseur IA simulé) : catalogue de départ, rédaction
 * par chapitres, contrôle qualité (références à vérifier, normes hors référentiel), validation, réécriture,
 * mise de côté motivée, export Word.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { setAiProviderForTests } from "../../server/ai/client.js";
import { fakeProvider } from "../../server/ai/fake.js";
import { runJob, setJobKickerForTests } from "../../server/jobs/runner.js";
import { adminSession, setupTestServer, TestBrowser } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof setupTestServer>>;
let admin: TestBrowser;
let projectId = "";
let lotId = "";
let documentId = "";
const refs: Record<string, string> = {};

beforeAll(async () => {
  ctx = await setupTestServer();
  admin = (await adminSession(ctx.app)).browser;
  setJobKickerForTests(async (id) => {
    await runJob(id);
  });
  setAiProviderForTests(fakeProvider);
  const project = await admin.request("/api/admin/projects", { body: { name: "Groupe scolaire", country: "FR", marketType: "appel_offres_ouvert", sector: "public", currency: "EUR" } });
  projectId = project.json.project.id;
  lotId = (await admin.request(`/api/admin/projects/${projectId}/lots`, { body: { code: "01", name: "Gros œuvre", tradeFamily: "gros_oeuvre" } })).json.lot.id;
  await admin.request(`/api/admin/projects/${projectId}/work-items`, { body: { code: "GO-01", designation: "Béton armé pour semelles filantes", unit: "m3", lotId } });
});

describe("référentiel", () => {
  it("importe le catalogue de départ « à vérifier », sans doublon", async () => {
    const first = await admin.request("/api/admin/references/catalogue", { body: {} });
    expect(first.json.imported).toBeGreaterThan(15);
    expect((await admin.request("/api/admin/references/catalogue", { body: {} })).json).toMatchObject({ imported: 0 });
    const list = (await admin.request("/api/admin/references?portee=FR")).json.items;
    expect(list.every((r: { scope: string; verificationStatus: string }) => r.scope === "FR" && r.verificationStatus === "a_verifier")).toBe(true);
    for (const r of list) refs[r.code] = r.id;
    expect(refs["NF DTU 21"]).toBeTruthy();
  });

  it("ajoute une référence, refuse un doublon, enregistre la vérification", async () => {
    const created = await admin.request("/api/admin/references", { body: { scope: "FR", kind: "norme", code: "NF P 18-545", title: "Granulats : éléments de définition, conformité et codification" } });
    expect(created.status).toBe(201);
    expect((await admin.request("/api/admin/references", { body: { scope: "FR", kind: "dtu", code: "NF DTU 21", title: "Doublon" } })).status).toBe(409);
    const verified = await admin.request(`/api/admin/references/${refs["NF DTU 21"]}/verify`, { body: { status: "verifie" } });
    expect(verified.json.reference.verificationStatus).toBe("verifie");
  });
});

describe("rédaction du CCTP", () => {
  it("exige l'accord d'envoi des informations à l'API", async () => {
    const res = await admin.request(`/api/admin/projects/${projectId}/cctp`, { body: { lotId, detailLevel: "standard", useMetre: true, referenceIds: [] } });
    expect(res.status).toBe(400);
    expect(res.json.fields.consent).toBeTruthy();
  });

  it("établit le plan puis rédige chaque chapitre, contrôle et fige une version", async () => {
    const res = await admin.request(`/api/admin/projects/${projectId}/cctp`, {
      body: { lotId, detailLevel: "standard", useMetre: true, referenceIds: [refs["NF EN 206/CN"]], instructions: "Bâtiment R+1.", consent: true },
    });
    expect(res.status).toBe(201);
    const job = (await admin.request(`/api/admin/agents/jobs/${res.json.job.id}`)).json.job;
    expect(job.status).toBe("termine");
    expect(job.steps.map((s: { label: string }) => s.label)).toEqual([
      "Plan du CCTP",
      "Rédaction du chapitre 1",
      "Rédaction du chapitre 2",
      "Rédaction du chapitre 3",
      "Contrôle qualité et version",
    ]);
    const list = (await admin.request(`/api/admin/projects/${projectId}/cctp`)).json.items;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ title: "CCTP, lot 01 Gros œuvre", status: "a_valider", articles: 4, currentVersion: 1 });
    documentId = list[0].id;

    const detail = (await admin.request(`/api/admin/cctp/${documentId}`)).json;
    const articles = detail.sections.filter((s: { kind: string }) => s.kind === "article");
    expect(articles.every((a: { content: unknown[]; status: string }) => a.content.length === 3 && a.status === "genere")).toBe(true);
    expect(articles.find((a: { number: string }) => a.number === "3.1").workItemId).toBeTruthy();
    expect(articles[0].intent).toBe("Définir l’objet et la consistance des travaux du lot.");
    const messages = detail.issues.map((i: { message: string }) => i.message);
    expect(messages.some((m: string) => m.startsWith("Référence à vérifier avant diffusion : NF EN 206/CN"))).toBe(true);
    expect(messages.some((m: string) => m.startsWith("Ouvrage du métré sans article"))).toBe(false);
    expect(detail.versions).toHaveLength(1);
  });

  it("signale une norme écrite hors référentiel après une modification", async () => {
    const detail = (await admin.request(`/api/admin/cctp/${documentId}`)).json;
    const article = detail.sections.find((s: { number: string }) => s.number === "2.1");
    const saved = await admin.request(`/api/admin/cctp/sections/${article.id}`, {
      method: "PATCH",
      body: { title: "Bétons", blocks: [{ type: "paragraphe", text: "Les bétons sont conformes à la NF EN 9999 et à la NF EN 206/CN.", items: [], referenceIds: [refs["NF EN 206/CN"], refs["NF DTU 23.1"]] }] },
    });
    expect(saved.json.section.status).toBe("a_valider");
    // Référence non retenue pour le document : retirée.
    expect(saved.json.section.referenceIds).toEqual([refs["NF EN 206/CN"]]);
    const issues = (await admin.request(`/api/admin/cctp/${documentId}`)).json.issues.map((i: { message: string }) => i.message);
    expect(issues.some((m: string) => m.startsWith("Norme citée hors référentiel : « NF EN 9999 »"))).toBe(true);
    expect(issues.some((m: string) => m.includes("NF EN 206/CN") && m.includes("hors référentiel"))).toBe(false);
  });

  it("refuse la validation tant qu'une référence rejetée est citée", async () => {
    await admin.request(`/api/admin/references/${refs["NF EN 206/CN"]}/verify`, { body: { status: "rejete" } });
    const refused = await admin.request(`/api/admin/cctp/${documentId}/validate`, { body: {} });
    expect(refused.status).toBe(409);
    await admin.request(`/api/admin/references/${refs["NF EN 206/CN"]}/verify`, { body: { status: "verifie" } });
    const ok = await admin.request(`/api/admin/cctp/${documentId}/validate`, { body: {} });
    expect(ok.json).toMatchObject({ ok: true, version: 2 });
    expect((await admin.request(`/api/admin/cctp/${documentId}`)).json.document.status).toBe("valide");
  });

  it("met de côté un point avec motif, et le garde écarté au contrôle suivant", async () => {
    const detail = (await admin.request(`/api/admin/cctp/${documentId}`)).json;
    const issue = detail.issues.find((i: { message: string; status: string }) => i.message.startsWith("Norme citée hors référentiel") && i.status === "ouverte");
    expect((await admin.request(`/api/admin/quality-issues/${issue.id}/ignore`, { body: { note: "" } })).status).toBe(400);
    const ignored = await admin.request(`/api/admin/quality-issues/${issue.id}/ignore`, { body: { note: "Norme interne du maître d’ouvrage, citée à sa demande." } });
    expect(ignored.json.issue.status).toBe("ignoree");
    await admin.request(`/api/admin/cctp/${documentId}/check`, { body: {} });
    const after = (await admin.request(`/api/admin/cctp/${documentId}`)).json.issues.filter((i: { message: string }) => i.message.startsWith("Norme citée hors référentiel"));
    expect(after.map((i: { status: string }) => i.status)).toEqual(["ignoree"]);
  });

  it("réécrit un article selon une consigne", async () => {
    const detail = (await admin.request(`/api/admin/cctp/${documentId}`)).json;
    const article = detail.sections.find((s: { number: string }) => s.number === "2.1");
    const res = await admin.request(`/api/admin/cctp/${documentId}/rewrite`, { body: { sectionIds: [article.id], instructions: "Préciser la classe d’exposition.", consent: true } });
    const job = (await admin.request(`/api/admin/agents/jobs/${res.json.job.id}`)).json.job;
    expect(job).toMatchObject({ status: "termine", title: "Réécriture d’articles du CCTP" });
    const rewritten = (await admin.request(`/api/admin/cctp/${documentId}`)).json.sections.find((s: { number: string }) => s.number === "2.1");
    expect(rewritten).toMatchObject({ status: "genere" });
    expect(rewritten.content[0].text).toContain("Bétons");
  });

  it("exporte un document Word modifiable", async () => {
    const res = await admin.request(`/api/admin/cctp/${documentId}/export.docx`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("wordprocessingml");
    expect(Buffer.from(res.bytes.subarray(0, 2)).toString()).toBe("PK");
    expect(Buffer.from(res.bytes).includes(Buffer.from("word/document.xml"))).toBe(true);
  });

  it("refuse de supprimer une référence citée", async () => {
    expect((await admin.request(`/api/admin/references/${refs["NF EN 206/CN"]}`, { method: "DELETE" })).status).toBe(409);
    expect((await admin.request(`/api/admin/references/${refs["NF DTU 13.3"]}`, { method: "DELETE" })).status).toBe(200);
  });
});
