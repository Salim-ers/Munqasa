/**
 * Moteur de métré : chaînes de cotes reconstituées à partir du texte vectoriel (écartements contrôlés à
 * l'échelle, cote totale retrouvée), métré des postes de DPGF restés « à métrer » à partir des relevés de
 * plans (fournisseur IA simulé) : quantité calculée par le serveur et tracée, ou données manquantes dites.
 */
import { PDFDocument, StandardFonts } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setAiProviderForTests } from "../../server/ai/client.js";
import { fakeBuilder, fakeProvider, setFakeBuilder } from "../../server/ai/fake.js";
import { runJob, setJobKickerForTests } from "../../server/jobs/runner.js";
import type { TextItem } from "../../server/services/pdf-text.js";
import { dimensionChains, dimensionMeters } from "../../server/services/plan-text.js";
import { adminSession, setupTestServer, type TestBrowser } from "./helpers.js";

/** Texte vertical (angle 90) : la cote est centrée sur « at », sa largeur est celle de son texte. */
const vertical = (text: string, x: number, at: number, width = 19.6): TextItem => ({ text, x, y: at + width / 2, width, height: 10.7, angle: 90 });
const horizontal = (text: string, at: number, y: number, width = 19.6): TextItem => ({ text, x: at - width / 2, y, width, height: 10.7, angle: 0 });
/** Points par mètre réel au 1/50. */
const K50 = (72 / 25.4) * 20;

describe("chaînes de cotes", () => {
  it("lit les cotes selon l'usage des plans : décimale en mètres, entière en centimètres, jamais une altitude", () => {
    expect(dimensionMeters("2.77")).toBe("2.77");
    expect(dimensionMeters("80")).toBe("0.8");
    expect(dimensionMeters("1,20")).toBe("1.2");
    expect(dimensionMeters("404.93")).toBeNull();
    expect(dimensionMeters("R+1")).toBeNull();
  });

  it("reconstitue une chaîne dont les écartements concordent avec l'échelle et retrouve sa cote totale", () => {
    // 1,55 + 0,80 + 4,83 = 7,18 m, cotes centrées sur leurs segments ; total 7,18 sur la ligne voisine.
    const start = 400;
    const centers = [1.55 / 2, 1.55 + 0.4, 1.55 + 0.8 + 4.83 / 2].map((m) => start + m * K50);
    const items = [horizontal("1.55", centers[0]!, 459.2), horizontal("80", centers[1]!, 459.2, 10.9), horizontal("4.83", centers[2]!, 459.2), horizontal("7.18", start + (7.18 / 2) * K50, 439)];
    const [chain] = dimensionChains(items, 50);
    expect(chain).toMatchObject({ orientation: "horizontale", sum: "7.18", verified: true, total: { text: "7.18", meters: "7.18" } });
    expect(chain!.items.map((i) => i.text)).toEqual(["1.55", "80", "4.83"]);
  });

  it("coupe la chaîne là où l'écartement ne correspond plus aux valeurs", () => {
    // Trois entraxes de 2,77 m, puis une cote isolée bien plus loin : elle n'appartient pas à la chaîne.
    const items = [0, 1, 2].map((i) => vertical("2.77", 157.4, 200 + i * 2.77 * K50));
    items.push(vertical("1.20", 157.4, 200 + 2 * 2.77 * K50 + 600));
    const chains = dimensionChains(items, 50);
    expect(chains).toHaveLength(1);
    expect(chains[0]).toMatchObject({ orientation: "verticale", sum: "8.31", verified: true, total: null });
  });

  it("sans échelle lue, regroupe les cotes alignées sans prétendre les avoir contrôlées", () => {
    const items = [horizontal("2.50", 100, 50), horizontal("3.00", 260, 50)];
    expect(dimensionChains(items, null)[0]).toMatchObject({ sum: "5.5", verified: false });
  });
});

describe("métré des postes restés à métrer", () => {
  let admin: TestBrowser;
  let projectId = "";
  const originalChapter = fakeBuilder("dpgf_chapitre");

  async function planPdf(): Promise<Uint8Array<ArrayBuffer>> {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const page = pdf.addPage([842, 595]);
    page.drawText("Plan de fondations", { x: 50, y: 500, size: 18, font });
    for (const [text, x, y] of [["42.50", 300, 280], ["60", 90, 300], ["Ht 40", 150, 260], ["ECH. 1/100", 600, 60]] as const) page.drawText(text, { x, y, size: 10, font });
    return new Uint8Array(await pdf.save());
  }

  beforeAll(async () => {
    const ctx = await setupTestServer();
    admin = (await adminSession(ctx.app)).browser;
    setJobKickerForTests(async (id) => {
      await runJob(id);
    });
    setAiProviderForTests(fakeProvider);
    projectId = (await admin.request("/api/admin/projects", { body: { name: "Groupe scolaire", country: "MA", city: "Rabat", marketType: "appel_offres_ouvert", sector: "public", currency: "MAD" } })).json.project.id;
    const lotId = (await admin.request(`/api/admin/projects/${projectId}/lots`, { body: { code: "01", name: "Gros œuvre", tradeFamily: "gros_oeuvre" } })).json.lot.id;
    const bytes = await planPdf();
    const req = await admin.request("/api/admin/files/upload-url", { body: { projectId, kind: "plan", fileName: "Fondations.pdf", sizeBytes: bytes.byteLength, contentType: "application/pdf" } });
    await admin.request(req.json.upload.url, { method: "PUT", raw: bytes, headers: { "content-type": "application/octet-stream" } });
    await admin.request(`/api/admin/files/${req.json.file.id}/complete`, { body: {} });
    const analysis = await admin.request(`/api/admin/projects/${projectId}/analyses`, { body: { fileIds: [req.json.file.id], lotId, consent: true } });
    expect((await admin.request(`/api/admin/agents/jobs/${analysis.json.job.id}`)).json.job.status).toBe("termine");
    await admin.request(`/api/admin/projects/${projectId}/cctp`, { body: { lotId, detailLevel: "synthetique", useMetre: true, referenceIds: [], consent: true } });
    // Chapitre de mise en œuvre : deux postes sans ouvrage du métré, l'un en mètres linéaires, l'autre en m2.
    setFakeBuilder("dpgf_chapitre", (input) => {
      const title = /Chapitre \S+ du CCTP : (.*)/.exec(input)?.[1]?.trim() ?? "Chapitre";
      if (!/mise en œuvre/i.test(title)) return { title, groups: [] };
      return {
        title,
        groups: [
          {
            title: null,
            postes: [
              { designation: "Longrines de redressement", description: null, unit: "ml", cctpArticle: "3.1", workItemCode: null, quantityBasis: "a_metrer" },
              { designation: "Dallage sur terre-plein", description: null, unit: "m2", cctpArticle: "3.1", workItemCode: null, quantityBasis: "a_metrer" },
            ],
          },
        ],
      };
    });
  });

  afterAll(() => {
    if (originalChapter) setFakeBuilder("dpgf_chapitre", originalChapter);
  });

  it("métré les postes mesurables à partir des planches lues et dit la donnée qui manque pour les autres", async () => {
    const cctpId = (await admin.request(`/api/admin/projects/${projectId}/cctp`)).json.items[0].id;
    const res = await admin.request(`/api/admin/projects/${projectId}/dpgf`, { body: { cctpDocumentId: cctpId, vatRate: "20", consent: true } });
    const job = (await admin.request(`/api/admin/agents/jobs/${res.json.job.id}`)).json.job;
    expect(job.status).toBe("termine");
    expect(job.steps.map((s: { label: string }) => s.label)).toContain("Métré des postes à métrer, série 1");
    const dpgfId = (await admin.request(`/api/admin/projects/${projectId}/dpgf`)).json.items[0].id;
    const lines = (await admin.request(`/api/admin/dpgf/${dpgfId}`)).json.lines as Array<{ designation: string; quantity: string | null; quantitySource: string | null; workItemId: string | null }>;
    const longrines = lines.find((l) => l.designation === "Longrines de redressement")!;
    // Longueur relevée 42,50 m, cote retrouvée dans le texte vectoriel : quantité calculée par le serveur.
    expect(longrines).toMatchObject({ quantity: "42.5000", quantitySource: "Métré : 1 mesure(s), dont 0 vérifiée(s)" });
    expect(longrines.workItemId).not.toBeNull();
    const dallage = lines.find((l) => l.designation === "Dallage sur terre-plein")!;
    expect(dallage).toMatchObject({ quantity: null, quantitySource: "À métrer : Dallage sur terre-plein : dimension non relevée sur les planches", workItemId: null });

    // Note de métrés : l'ouvrage du poste, sa formule et sa cote d'origine.
    const metre = (await admin.request(`/api/admin/projects/${projectId}/metre`)).json as { workItems: Array<{ code: string; designation: string; measurements: Array<{ formula: string; quantity: string; inputSources: Array<{ dimensions: Array<{ check: string }> }> }> }> };
    const item = metre.workItems.find((w) => w.designation === "Longrines de redressement")!;
    expect(item.code).toMatch(/^P\d/);
    expect(item.measurements[0]).toMatchObject({ formula: "L", quantity: "42.5000" });
    expect(item.measurements[0]!.inputSources[0]!.dimensions[0]!.check).toBe("couche_texte");
  });
});
