/**
 * Agent « DPGF depuis le CCTP » et édition de la DPGF (fournisseur IA simulé) : quantités reprises du
 * métré, forfaits, montants et taxe exacts, renumérotation, contrôle qualité, validation, export Excel.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { setAiProviderForTests } from "../../server/ai/client.js";
import { fakeProvider } from "../../server/ai/fake.js";
import { runJob, setJobKickerForTests } from "../../server/jobs/runner.js";
import { adminSession, setupTestServer, TestBrowser } from "./helpers.js";

let admin: TestBrowser;
let projectId = "";
let cctpId = "";
let dpgfId = "";

interface Line {
  id: string;
  code: string;
  kind: string;
  designation: string;
  unit: string | null;
  quantity: string | null;
  unitPrice: string | null;
  amount: string | null;
  quantitySource: string | null;
  status: string;
  parentId: string | null;
}

const lines = async () => (await admin.request(`/api/admin/dpgf/${dpgfId}`)).json as { lines: Line[]; totals: Record<string, unknown>; issues: Array<{ message: string; status: string }>; dpgf: { status: string; currentVersion: number } };

beforeAll(async () => {
  const ctx = await setupTestServer();
  admin = (await adminSession(ctx.app)).browser;
  setJobKickerForTests(async (id) => {
    await runJob(id);
  });
  setAiProviderForTests(fakeProvider);
  const project = await admin.request("/api/admin/projects", { body: { name: "Groupe scolaire", country: "MA", marketType: "appel_offres_ouvert", sector: "public", currency: "MAD" } });
  projectId = project.json.project.id;
  const lotId = (await admin.request(`/api/admin/projects/${projectId}/lots`, { body: { code: "01", name: "Gros œuvre", tradeFamily: "gros_oeuvre" } })).json.lot.id;
  const item = (await admin.request(`/api/admin/projects/${projectId}/work-items`, { body: { code: "GO-01", designation: "Béton armé pour semelles filantes", unit: "m3", lotId } })).json.workItem;
  const measure = (
    await admin.request(`/api/admin/work-items/${item.id}/measurements`, {
      body: { label: "SF1", method: "volume", formula: "L * l * h", inputs: [{ name: "L", value: "42.5" }, { name: "l", value: "0.6" }, { name: "h", value: "0.4" }], unit: "m3" },
    })
  ).json.measurement;
  await admin.request(`/api/admin/measurements/${measure.id}/validate`, { body: { status: "verifie" } });
  await admin.request(`/api/admin/projects/${projectId}/cctp`, { body: { lotId, detailLevel: "synthetique", useMetre: true, referenceIds: [], consent: true } });
  cctpId = (await admin.request(`/api/admin/projects/${projectId}/cctp`)).json.items[0].id;
});

describe("DPGF depuis le CCTP", () => {
  it("exige un CCTP de l'affaire et l'accord d'envoi", async () => {
    expect((await admin.request(`/api/admin/projects/${projectId}/dpgf`, { body: { cctpDocumentId: cctpId } })).status).toBe(400);
    expect((await admin.request(`/api/admin/projects/${projectId}/dpgf`, { body: { cctpDocumentId: crypto.randomUUID(), consent: true } })).status).toBe(400);
  });

  it("établit les postes chapitre par chapitre, quantités reprises du métré", async () => {
    const res = await admin.request(`/api/admin/projects/${projectId}/dpgf`, { body: { cctpDocumentId: cctpId, vatRate: "20", consent: true } });
    expect(res.status).toBe(201);
    const job = (await admin.request(`/api/admin/agents/jobs/${res.json.job.id}`)).json.job;
    expect(job.status).toBe("termine");
    expect(job.steps.map((s: { label: string }) => s.label)).toEqual([
      "Préparation de la DPGF",
      "Postes du chapitre 1 du CCTP",
      "Postes du chapitre 2 du CCTP",
      "Postes du chapitre 3 du CCTP",
      "Quantités, contrôle qualité et version",
    ]);
    const list = (await admin.request(`/api/admin/projects/${projectId}/dpgf`)).json.items;
    expect(list[0]).toMatchObject({ title: "DPGF, lot 01 Gros œuvre", currency: "MAD", vatRate: "20.0000", postes: 2, priced: 0, totalHt: "0.00", status: "a_valider", currentVersion: 1 });
    dpgfId = list[0].id;

    const { lines: all, issues } = await lines();
    expect(all.map((l) => [l.code, l.kind, l.designation])).toEqual([
      ["1", "chapitre", "Installation et généralités"],
      ["1.1", "poste", "Installation de chantier"],
      ["2", "chapitre", "Mise en œuvre"],
      ["2.1", "poste", "Béton armé pour semelles filantes"],
    ]);
    expect(all[1]).toMatchObject({ unit: "ens", quantity: "1.0000", quantitySource: "Forfait", status: "non_chiffre" });
    expect(all[3]).toMatchObject({ unit: "m3", quantity: "10.2000", quantitySource: "Métré : 1 mesure(s), dont 1 vérifiée(s)" });
    expect(issues.map((i) => i.message)).toContain("2 poste(s) sans prix unitaire : à chiffrer (sous-détails, bibliothèque ou saisie).");
  });

  it("calcule montants, taxe et totaux en décimal exact", async () => {
    const { lines: all } = await lines();
    const beton = all.find((l) => l.code === "2.1")!;
    const install = all.find((l) => l.code === "1.1")!;
    expect((await admin.request(`/api/admin/dpgf/lines/${beton.id}`, { method: "PATCH", body: { unitPrice: "1 250,50" } })).json.line).toMatchObject({ amount: "12755.10", status: "a_verifier", priceSource: "Saisie" });
    await admin.request(`/api/admin/dpgf/lines/${install.id}`, { method: "PATCH", body: { unitPrice: "35000" } });
    const { totals } = await lines();
    // 12 755,10 + 35 000 = 47 755,10 ; taxe à 20 % : 9 551,02 ; total : 57 306,12.
    expect(totals).toMatchObject({ totalHt: "47755.10", vat: "9551.02", totalTtc: "57306.12", priced: 2, postes: 2 });
    expect((totals.subtotals as Record<string, string>)[all.find((l) => l.code === "2")!.id]).toBe("12755.10");
  });

  it("valide un poste chiffré seulement", async () => {
    const { lines: all } = await lines();
    const beton = all.find((l) => l.code === "2.1")!;
    expect((await admin.request(`/api/admin/dpgf/lines/${beton.id}/validate`, { body: {} })).json.line.status).toBe("valide");
    const chapter = all.find((l) => l.code === "2")!;
    expect((await admin.request(`/api/admin/dpgf/lines/${chapter.id}/validate`, { body: {} })).status).toBe(409);
  });

  it("ajoute, renumérote et supprime des lignes ; signale une unité différente du métré", async () => {
    const { lines: all } = await lines();
    const chapter = all.find((l) => l.code === "2")!;
    const added = await admin.request(`/api/admin/dpgf/${dpgfId}/lines`, { body: { kind: "poste", parentId: chapter.id, designation: "Béton de propreté", unit: "m2", quantity: "34", cctpRef: "3.1" } });
    expect(added.status).toBe(201);
    let after = (await lines()).lines;
    expect(after.find((l) => l.id === added.json.line.id)!.code).toBe("2.2");
    expect(after.find((l) => l.id === added.json.line.id)!.quantitySource).toBe("Saisie");

    const beton = after.find((l) => l.code === "2.1")!;
    await admin.request(`/api/admin/dpgf/lines/${beton.id}`, { method: "PATCH", body: { unit: "m2" } });
    expect((await lines()).issues.map((i) => i.message)).toContain("Unité différente du métré (m2 au lieu de m3) : 2.1 Béton armé pour semelles filantes");
    await admin.request(`/api/admin/dpgf/lines/${beton.id}`, { method: "PATCH", body: { unit: "m3" } });

    await admin.request(`/api/admin/dpgf/lines/${all.find((l) => l.code === "1")!.id}`, { method: "DELETE" });
    after = (await lines()).lines;
    expect(after.map((l) => l.code)).toEqual(["1", "1.1", "1.2"]);
    expect(after[0]!.designation).toBe("Mise en œuvre");
  });

  it("refuse un poste sans chapitre", async () => {
    expect((await admin.request(`/api/admin/dpgf/${dpgfId}/lines`, { body: { kind: "poste", designation: "Orphelin" } })).status).toBe(400);
  });

  it("valide la DPGF, fige une version et l'exporte en Excel", async () => {
    const validated = await admin.request(`/api/admin/dpgf/${dpgfId}/validate`, { body: {} });
    expect(validated.json).toMatchObject({ ok: true, version: 2 });
    const res = await admin.request(`/api/admin/dpgf/${dpgfId}/export.xlsx`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("spreadsheetml");
    expect(Buffer.from(res.bytes.subarray(0, 2)).toString()).toBe("PK");
    expect(Buffer.from(res.bytes).includes(Buffer.from("xl/worksheets/sheet1.xml"))).toBe(true);
    // Une modification remet la DPGF « à valider ».
    const { lines: all } = await lines();
    await admin.request(`/api/admin/dpgf/lines/${all[1]!.id}`, { method: "PATCH", body: { quantity: "11" } });
    expect((await lines()).dpgf.status).toBe("a_valider");
  });
});
