/**
 * Catalogue des lots, sur une vraie base PostgreSQL : nomenclature par défaut de 30 lots et ses modèles,
 * ajout groupé de lots à une affaire sans renuméroter ses lots existants, nomenclature modifiée sans effet
 * sur les affaires, suggestions tirées des plans, favoris et récents, fusion et séparation de lots du
 * catalogue, fusion de deux lots d'une affaire (refusée quand le lot absorbé a ses documents), même numéro et
 * même intitulé sur tous les documents du lot.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { setAiProviderForTests } from "../../server/ai/client.js";
import { fakeProvider } from "../../server/ai/fake.js";
import { schema } from "../../server/db/index.js";
import { runJob, setJobKickerForTests } from "../../server/jobs/runner.js";
import { pdfPlainText } from "../../server/services/pdf-text.js";
import { adminSession, setupTestServer, type TestBrowser } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof setupTestServer>>;
let admin: TestBrowser;
let projectId = "";

type Entry = { id: string; number: string; name: string; tradeFamily: string; parentId: string | null; favorite: boolean; archived: boolean };
type Catalog = { id: string; name: string; isDefault: boolean; projectType: string | null; entries: Entry[] };
const catalogs = async () => (await admin.request("/api/admin/lot-catalogs")).json as { catalogs: Catalog[]; recent: Array<{ code: string; name: string }> };
const lots = async () => (await admin.request(`/api/admin/projects/${projectId}`)).json.lots as Array<{ id: string; code: string; name: string; parentId: string | null; catalogEntryId: string | null }>;

beforeAll(async () => {
  ctx = await setupTestServer();
  admin = (await adminSession(ctx.app)).browser;
  setJobKickerForTests(async (id) => {
    await runJob(id);
  });
  setAiProviderForTests(fakeProvider);
  projectId = (await admin.request("/api/admin/projects", { body: { name: "Résidence des Oliviers", country: "MA", city: "Rabat", marketType: "appel_offres_ouvert", sector: "public", currency: "MAD" } })).json.project.id;
  // Lot saisi avant le catalogue : il garde son numéro et son intitulé quoi qu'il arrive.
  await admin.request(`/api/admin/projects/${projectId}/lots`, { body: { code: "01", name: "Gros oeuvre", tradeFamily: "gros_oeuvre" } });
});

describe("nomenclature par défaut", () => {
  it("propose 30 lots numérotés et les sous-lots du gros œuvre, en nomenclature par défaut", async () => {
    const { catalogs: list } = await catalogs();
    const main = list.find((c) => c.isDefault)!;
    expect(main.name).toBe("Bâtiment, nomenclature complète");
    const top = main.entries.filter((e) => !e.parentId);
    expect(top.map((e) => e.number)).toEqual(Array.from({ length: 30 }, (_, i) => String(i + 1).padStart(2, "0")));
    expect(top.find((e) => e.number === "01")!.name).toBe("Gros œuvre");
    expect(top.find((e) => e.number === "30")!.name).toBe("Piscines / Ouvrages spécifiques");
    const go = top.find((e) => e.number === "01")!;
    expect(main.entries.filter((e) => e.parentId === go.id).map((e) => `${e.number} ${e.name}`)).toEqual([
      "01.01 Installation de chantier",
      "01.02 Terrassements associés",
      "01.03 Fondations",
      "01.04 Béton armé",
      "01.05 Planchers",
      "01.06 Maçonneries",
      "01.07 Ouvrages divers",
    ]);
  });

  it("propose des modèles par type d'opération, créés une seule fois", async () => {
    const { catalogs: list } = await catalogs();
    expect(list.map((c) => c.name)).toEqual(["Bâtiment, nomenclature complète", "Logements, opération courante", "Réhabilitation", "VRD et aménagements extérieurs"]);
    const vrd = list.find((c) => c.projectType === "vrd")!;
    expect(vrd.entries.filter((e) => !e.parentId).map((e) => e.number)).toEqual(["02", "03", "26", "27", "28"]);
    expect((await catalogs()).catalogs).toHaveLength(4);
  });
});

describe("lots d'une affaire", () => {
  it("ajoute plusieurs lots en une fois sans renuméroter ni modifier le lot existant", async () => {
    const main = (await catalogs()).catalogs.find((c) => c.isDefault)!;
    const pick = (number: string) => main.entries.find((e) => e.number === number)!.id;
    const res = await admin.request(`/api/admin/projects/${projectId}/lots/bulk`, {
      body: { selections: [{ catalogEntryId: pick("01") }, { catalogEntryId: pick("08") }, { catalogEntryId: pick("01.04") }, { code: "31", name: "Désamiantage", tradeFamily: "preparation_terrassement" }] },
    });
    expect(res.status).toBe(201);
    expect(res.json.created.map((l: { code: string }) => l.code).sort()).toEqual(["01.04", "08", "31"]);
    expect(res.json.skipped).toEqual([{ code: "01", reason: "numéro déjà utilisé dans l’affaire : lot existant conservé tel quel" }]);
    const all = await lots();
    const go = all.find((l) => l.code === "01")!;
    expect(go.name).toBe("Gros oeuvre");
    // Le sous-lot rejoint le lot de l'affaire qui porte le numéro de son lot parent.
    expect(all.find((l) => l.code === "01.04")).toMatchObject({ name: "Béton armé", parentId: go.id });
    expect(all.find((l) => l.code === "08")!.catalogEntryId).toBe(pick("08"));
    expect((await catalogs()).recent.map((r) => r.code)).toEqual(expect.arrayContaining(["08", "31", "01.04"]));
  });

  it("une nomenclature modifiée ne change aucune affaire existante", async () => {
    const main = (await catalogs()).catalogs.find((c) => c.isDefault)!;
    const couverture = main.entries.find((e) => e.number === "08")!;
    expect((await admin.request(`/api/admin/lot-catalog-entries/${couverture.id}`, { method: "PATCH", body: { name: "Couverture et zinguerie", number: "08A" } })).status).toBe(200);
    expect((await lots()).find((l) => l.code === "08")!.name).toBe("Couverture");
    await admin.request(`/api/admin/lot-catalog-entries/${couverture.id}`, { method: "PATCH", body: { name: "Couverture", number: "08" } });
  });

  it("suggère les lots d'après les éléments relevés sur les plans", async () => {
    const [file] = await ctx.db.insert(schema.sourceFile).values({ projectId, kind: "plan", originalName: "Plans.pdf", mimeType: "application/pdf", sizeBytes: 1000, storageKey: `test/${projectId}/plans.pdf`, status: "verifie" }).returning();
    await ctx.db.insert(schema.drawing).values({
      projectId,
      sourceFileId: file!.id,
      pageNumber: 1,
      extraction: {
        sheet: { title: "Niveau 0", number: "A01", kind: "plan_niveau", level: "RDC", scale: "1/50", readable: true },
        elements: [
          { category: "fondation", designation: "Semelle filante SF1", location: null, count: 1, material: null, dimensions: [], confidence: "elevee", note: null },
          { category: "voile", designation: "Voile V1", location: null, count: 2, material: null, dimensions: [], confidence: "elevee", note: null },
          { category: "reseau", designation: "Réseau pluvial", location: null, count: null, material: null, dimensions: [], confidence: "moyenne", note: null },
          { category: "menuiserie", designation: "Baie ME 01", location: null, count: 3, material: null, dimensions: [], confidence: "elevee", note: null },
        ],
        notes: [],
        uncertainties: [],
      },
    });
    const { suggestions } = (await admin.request(`/api/admin/projects/${projectId}/lot-suggestions`)).json as { suggestions: Array<{ number: string; elements: number; examples: string[] }> };
    expect(suggestions[0]).toMatchObject({ number: "01", elements: 2, examples: ["Semelle filante SF1", "Voile V1"] });
    expect(suggestions.map((s) => s.number)).toEqual(expect.arrayContaining(["03", "11", "12"]));
  });

  it("fusionne deux lots de l'affaire, et refuse si le lot absorbé a déjà son CCTP", async () => {
    const all = await lots();
    const desamiantage = all.find((l) => l.code === "31")!;
    const couverture = all.find((l) => l.code === "08")!;
    const item = (await admin.request(`/api/admin/projects/${projectId}/work-items`, { body: { code: "DM-01", designation: "Retrait de flocage", unit: "m2", lotId: desamiantage.id } })).json.workItem;
    const merged = await admin.request(`/api/admin/projects/${projectId}/lots/${desamiantage.id}/merge`, { body: { targetId: couverture.id } });
    expect(merged.json).toEqual({ moved: 1 });
    expect((await lots()).some((l) => l.code === "31")).toBe(false);
    const [moved] = (await ctx.db.select().from(schema.workItem)).filter((w) => w.id === item.id);
    expect(moved!.lotId).toBe(couverture.id);

    const go = all.find((l) => l.code === "01")!;
    await admin.request(`/api/admin/projects/${projectId}/cctp`, { body: { lotId: go.id, detailLevel: "synthetique", useMetre: false, referenceIds: [], consent: true } });
    expect((await admin.request(`/api/admin/projects/${projectId}/lots/${go.id}/merge`, { body: { targetId: couverture.id } })).status).toBe(409);
  });

  it("garde le numéro et l'intitulé du lot de l'affaire sur le CCTP : titre et couverture", async () => {
    const cctp = (await admin.request(`/api/admin/projects/${projectId}/cctp`)).json.items[0];
    expect(cctp.title).toBe("CCTP, lot 01 Gros oeuvre");
    const text = (await pdfPlainText((await admin.request(`/api/admin/exports/cctp/${cctp.id}/pdf`)).bytes)).join(" ");
    expect(text).toContain("Lot 01, Gros oeuvre");
    expect(text).not.toContain("Gros œuvre");
  });
});

describe("édition des nomenclatures", () => {
  let copyId = "";

  it("crée une nomenclature par copie, puis la propose par défaut", async () => {
    const main = (await catalogs()).catalogs.find((c) => c.isDefault)!;
    const res = await admin.request("/api/admin/lot-catalogs", { body: { name: "Marchés publics, Maroc", country: "MA", copyFrom: main.id } });
    expect(res.status).toBe(201);
    copyId = res.json.catalog.id;
    const copy = (await catalogs()).catalogs.find((c) => c.id === copyId)!;
    expect(copy.entries).toHaveLength(main.entries.length);
    // Sous-lots rattachés à leurs nouveaux parents, dans la copie.
    const go = copy.entries.find((e) => e.number === "01")!;
    expect(copy.entries.filter((e) => e.parentId === go.id)).toHaveLength(7);
    await admin.request(`/api/admin/lot-catalogs/${copyId}`, { method: "PATCH", body: { isDefault: true } });
    expect((await catalogs()).catalogs.filter((c) => c.isDefault).map((c) => c.id)).toEqual([copyId]);
  });

  it("fusionne des lots : les lots fusionnés sont retirés sans être effacés, leurs sous-lots suivent", async () => {
    const copy = (await catalogs()).catalogs.find((c) => c.id === copyId)!;
    const go = copy.entries.find((e) => e.number === "01")!;
    const etancheite = copy.entries.find((e) => e.number === "09")!;
    const res = await admin.request(`/api/admin/lot-catalogs/${copyId}/merge`, { body: { entryIds: [go.id, etancheite.id], number: "01", name: "Gros œuvre et étanchéité" } });
    expect(res.status).toBe(201);
    const after = (await catalogs()).catalogs.find((c) => c.id === copyId)!;
    const merged = after.entries.find((e) => e.number === "01")!;
    expect(merged).toMatchObject({ name: "Gros œuvre et étanchéité", archived: false });
    expect(after.entries.filter((e) => e.archived).map((e) => e.name).sort()).toEqual(["Gros œuvre", "Étanchéité"]);
    expect(after.entries.filter((e) => e.parentId === merged.id)).toHaveLength(7);
  });

  it("sépare un lot en deux, ajoute un sous-lot, marque un favori, refuse un numéro déjà pris", async () => {
    const copy = (await catalogs()).catalogs.find((c) => c.id === copyId)!;
    const cloisons = copy.entries.find((e) => e.number === "14")!;
    expect((await admin.request(`/api/admin/lot-catalog-entries/${cloisons.id}/split`, { body: { number: "14A", name: "Doublages" } })).status).toBe(201);
    expect((await admin.request(`/api/admin/lot-catalog-entries/${cloisons.id}/split`, { body: { number: "14A", name: "Encore" } })).status).toBe(409);
    expect((await admin.request(`/api/admin/lot-catalogs/${copyId}/entries`, { body: { number: "14.01", name: "Cloisons de distribution", tradeFamily: "second_oeuvre", parentId: cloisons.id } })).status).toBe(201);
    await admin.request(`/api/admin/lot-catalog-entries/${cloisons.id}`, { method: "PATCH", body: { favorite: true } });
    const after = (await catalogs()).catalogs.find((c) => c.id === copyId)!;
    expect(after.entries.find((e) => e.number === "14A")).toMatchObject({ name: "Doublages", tradeFamily: "second_oeuvre" });
    expect(after.entries.find((e) => e.number === "14")!.favorite).toBe(true);
    expect(after.entries.find((e) => e.number === "14.01")!.parentId).toBe(cloisons.id);
  });

  it("supprime une nomenclature sans toucher aux affaires, jamais la dernière", async () => {
    const before = await lots();
    expect((await admin.request(`/api/admin/lot-catalogs/${copyId}`, { method: "DELETE" })).status).toBe(200);
    expect(await lots()).toEqual(before);
    expect((await catalogs()).catalogs.filter((c) => c.isDefault)).toHaveLength(1);
    const rest = (await catalogs()).catalogs;
    for (const c of rest.slice(1)) await admin.request(`/api/admin/lot-catalogs/${c.id}`, { method: "DELETE" });
    expect((await admin.request(`/api/admin/lot-catalogs/${rest[0]!.id}`, { method: "DELETE" })).status).toBe(409);
  });
});
