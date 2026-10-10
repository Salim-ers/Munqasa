/**
 * Sources publiques de la bibliothèque de prix : lecture des classeurs du ministère marocain, des tables
 * ADEME et des ratios de la Caisse des Dépôts ; lots contrôlés (quarantaine des valeurs douteuses,
 * publication, rejet, annulation) ; recherche des prix candidats par proximité, prix TTC ramenés HT ;
 * filtres, comparaison, doublons ; références publiques non modifiables ; import de fichier réversible ;
 * vérification planifiée.
 */
import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { SourceRecord } from "../../shared/prices.js";
import { type Database, schema } from "../../server/db/index.js";
import { runJob, setJobKickerForTests } from "../../server/jobs/runner.js";
import { parseAdeme } from "../../server/services/price-sources/ademe.js";
import { parseCdc } from "../../server/services/price-sources/cdc.js";
import { analyze, ensureSources, publishRows, rejectRows, revertBatch, type SourceRow, stageBatch } from "../../server/services/price-sources/engine.js";
import { parseMatnuhpv } from "../../server/services/price-sources/matnuhpv.js";
import { scheduleSourceChecks } from "../../server/services/price-sources/schedule.js";
import { findCandidates } from "../../server/services/pricing.js";
import { adminSession, setupTestServer, type TestBrowser } from "./helpers.js";

let db: Database;
let admin: TestBrowser;

beforeAll(async () => {
  const ctx = await setupTestServer();
  db = ctx.db;
  admin = (await adminSession(ctx.app)).browser;
  setJobKickerForTests(async (id) => {
    await runJob(id);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ---------- Classeurs de test au format du ministère ---------- */

type Line = [corps: string, activite: string, produit: string, variete: string, ...values: Array<number | null>];

function sheet(wb: ExcelJS.Workbook, name: string, title: string, years: number[], lines: Line[]) {
  const ws = wb.addWorksheet(name);
  ws.addRow([title]);
  ws.addRow(["Corps ", "Activité", "Produit", "Variété", "Prix de vente moyens TTC (DH)"]);
  ws.addRow([null, null, null, null, ...years]);
  for (const line of lines) ws.addRow(line);
}

async function workbook(build: (wb: ExcelJS.Workbook) => void): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  build(wb);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function matnuhpvFixtures() {
  const national = await workbook((wb) => {
    sheet(wb, "T1 CS PNM", "Tableau n°554 : Evolution des prix moyens au niveau de la région de Casablanca Settat", [2018, 2019], [["Gros œuvre", "Ciment", "Ciment CPJ 45", "CPJ 45 (t)", 1400, 1450]]);
    sheet(wb, "T2 CS PNM", "Tableau n°555 : indices", [2018, 2019], [["Gros œuvre", "Ciment", "Ciment CPJ 45", "CPJ 45 (t)", 100, 103]]);
    sheet(wb, "T1 NATIONAL PNM", "Tableau n°575 : Evolution des prix moyens au niveau national", [2018, 2019], [
      ["Gros œuvre", "Ciment", "Ciment CPJ 45", "CPJ 45 (t)", 1420, 1480],
      ["", "Agglomérés et articles en ciment ou en PVC", "BPE", "BPE (m3)", 950, 970],
    ]);
  });
  const regional = await workbook((wb) => {
    const years = [2019, 2020, 2021, 2022];
    sheet(wb, "T1 CS PNM", "Tableau n°554 : Evolution des prix moyens au niveau de la région de Casablanca Settat", years, [
      ["Gros œuvre", "Ciment", "Ciment CPJ 45", "CPJ 45 (t)", 1460, 1500, 1600, 1700],
      ["", "Agglomérés et articles en ciment ou en PVC", "Béton prêt à l'emploi", "BPE (m3)", 980, 990, 1000, 1010],
      ["", "", "Hourdis", "Sans unité", 5, 5, 5, 5],
    ]);
    sheet(wb, "T1 CASA", "Tableau n°386 : Evolution des prix moyens au niveau de l'agglomération de Casablanca", years, [["Gros œuvre", "Ciment", "Ciment CPJ 45", "CPJ 45 (t)", 1470, 1510, 1620, 1720]]);
    sheet(wb, "T1 SETTAT", "Tableau n°404 : Evolution des prix moyens au niveau de l'agglomération de Settat", years, [["Gros œuvre", "Ciment", "Ciment CPJ 45", "CPJ 45 (t)", 1440, null, 0, 1650]]);
    sheet(wb, "T1 BERRECHID", "Tableau n°401 : Evolution des prix moyens au niveau de l'agglomération de Berrechid", years, [["Gros œuvre", "Ciment", "Ciment CPJ 45", "CPJ 45 (t)", 1450, 1490, 1590, 1690]]);
  });
  return [
    { url: "https://data.gov.ma/test/national.xlsx", title: "National", data: national },
    { url: "https://data.gov.ma/test/casablanca-settat.xlsx", title: "Casablanca-Settat", data: regional },
  ];
}

const byKey = (records: SourceRecord[], key: string) => records.find((r) => r.externalKey === key)!;

describe("Lecture des sources publiques", () => {
  it("lit les prix TTC du ministère par zone, préfère la publication régionale et calcule la fourchette des agglomérations", async () => {
    const records = await parseMatnuhpv(await matnuhpvFixtures());
    expect(records.map((r) => r.externalKey).sort()).toEqual([
      "agglo-berrechid:ciment-cpj-45-cpj-45",
      "agglo-casablanca:ciment-cpj-45-cpj-45",
      "agglo-settat:ciment-cpj-45-cpj-45",
      "national:beton-pret-a-l-emploi-bpe",
      "national:ciment-cpj-45-cpj-45",
      "region-casablanca-settat:beton-pret-a-l-emploi-bpe",
      "region-casablanca-settat:ciment-cpj-45-cpj-45",
    ]);
    const region = byKey(records, "region-casablanca-settat:ciment-cpj-45-cpj-45");
    expect(region).toMatchObject({
      designation: "Ciment CPJ 45",
      unit: "t",
      unitPrice: "1700",
      period: "2022",
      priceDate: "2022-07-01",
      region: "Casablanca-Settat",
      city: null,
      taxBasis: "TTC",
      vatRate: "20",
      scope: "fourniture",
      kind: "materiau",
      valueStatus: "source",
      reliability: "haute",
      priceMin: "1650",
      priceMax: "1720",
      tradeFamily: "gros_oeuvre",
      groupKey: "matnuhpv:ciment-cpj-45-cpj-45",
      sourceUrl: "https://data.gov.ma/test/casablanca-settat.xlsx",
    });
    expect(region.series).toEqual({ "2019": 1460, "2020": 1500, "2021": 1600, "2022": 1700 });
    // Une cellule vide ou nulle n'est pas un prix.
    expect(byKey(records, "agglo-settat:ciment-cpj-45-cpj-45").series).toEqual({ "2019": 1440, "2022": 1650 });
    expect(byKey(records, "agglo-casablanca:ciment-cpj-45-cpj-45")).toMatchObject({ city: "Casablanca", region: "Casablanca-Settat", priceMin: null });
    expect(byKey(records, "national:ciment-cpj-45-cpj-45")).toMatchObject({ unitPrice: "1480", period: "2019", region: null, city: null });
    // Deux écritures du béton prêt à l'emploi : une seule référence.
    expect(byKey(records, "national:beton-pret-a-l-emploi-bpe").designation).toBe("Béton prêt à l’emploi");
    expect(region.description).not.toMatch(/[()]/);
  });

  it("agrège les gestes ADEME : prix unitaire de chaque geste, médiane et quartiles, gestes sans quantité écartés", () => {
    const header = "id;cout_total_ht;surface;annee_travaux;date_x;poste_isolation;isolant";
    const rows = Array.from({ length: 20 }, (_, i) => `${i + 1};${(i + 1) * 1000};100;${2014 + (i % 5)};;COMBLES PERDUES;LAINE MINERALE`);
    rows.push("21;5000;;2016;;COMBLES PERDUES;LAINE MINERALE", "22;0;100;2016;;COMBLES PERDUES;LAINE MINERALE");
    const menuiserie = "id;cout_total_ht;nb_ouvertures;annee_travaux;date_x;type_menuiserie;materiaux";
    const windows = Array.from({ length: 20 }, (_, i) => `${i + 1};${(i + 1) * 300};3;2015;15/06/2015;FENETRE;PVC`);
    const records = parseAdeme([
      { url: "https://data.ademe.fr/isolation/raw", title: "Isolation", table: "isolation", text: [header, ...rows].join("\r\n") },
      { url: "https://data.ademe.fr/menuiseries/raw", title: "Menuiseries", table: "menuiseries", text: [menuiserie, ...windows].join("\n") },
    ]);
    const combles = byKey(records, "ademe:isolation:combles-perdues-laine-minerale");
    // Prix unitaires 10, 20… 200 €/m² : médiane 105, quartiles 57,5 et 152,5 (interpolation linéaire).
    expect(combles).toMatchObject({
      designation: "Isolation des combles perdus en laine minérale, fourniture et pose",
      unit: "m²",
      unitPrice: "105",
      priceMin: "57.5",
      priceMax: "152.5",
      sampleSize: 20,
      period: "2014 à 2018",
      taxBasis: "HT",
      valueStatus: "calculee",
      scope: "fourniture_pose",
      kind: "ouvrage",
      currency: "EUR",
      country: "FR",
      reliability: "faible",
    });
    expect(combles.aggregation).toContain("Médiane de 20 gestes");
    expect(byKey(records, "ademe:isolation:combles-perdues")).toMatchObject({ sampleSize: 20, unitPrice: "105" });
    expect(byKey(records, "ademe:menuiseries:fenetre-pvc")).toMatchObject({ unit: "u", unitPrice: "1050", priceDate: "2015-06-15", period: "2015" });
    // Moins de 20 gestes : rien n'est publié pour les autres postes.
    expect(records.some((r) => r.externalKey.startsWith("ademe:isolation:ite"))).toBe(false);
  });

  it("reprend les ratios de la Caisse des Dépôts, valeur nulle comprise comme absence de donnée", () => {
    const csv = [
      "﻿code_region;region;annee_signature;Construction - Surface médiane des opérations (m² SU);Construction - Prix de revient médian au M² des opérations;Construction - Prix de revient médian des opérations au logement;Réhabilitation - Surface médiane des opérations (m² SU);Réhabilitation - Prix de revient médian au M² des opérations;Réhabilitation - Prix de revient médian des opérations au logement;geom;centroid",
      '53;BRETAGNE;2024;65;2500;160000;60;900;55000;"{""a"": 1}";',
      "53;BRETAGNE;2025;66;2600;170000;0;0;0;;",
      "XX;NOUVELLE CALEDONIE;2025;83;2855;234523;;;;;",
    ].join("\n");
    const records = parseCdc({ url: "https://opendata.caissedesdepots.fr/test.csv", title: "Export", text: csv });
    expect(byKey(records, "cdc:bretagne:construction-m2")).toMatchObject({ unitPrice: "2600", period: "2025", unit: "m² SU", kind: "ratio", scope: "ouvrage_complet", region: "Bretagne", taxBasis: null, series: { "2024": 2500, "2025": 2600 } });
    expect(byKey(records, "cdc:bretagne:rehabilitation-m2")).toMatchObject({ unitPrice: "900", period: "2024", series: { "2024": 900 } });
    expect(byKey(records, "cdc:nouvelle-caledonie:construction-logement")).toMatchObject({ region: "Nouvelle-Calédonie", unitPrice: "234523" });
    expect(records.some((r) => r.externalKey === "cdc:nouvelle-caledonie:rehabilitation-m2")).toBe(false);
  });
});

/* ---------- Lots ---------- */

let matnuhpv: SourceRow;
let records: SourceRecord[];

const item = async (externalKey: string) => (await db.select().from(schema.priceItem).where(and(eq(schema.priceItem.sourceId, matnuhpv.id), eq(schema.priceItem.externalKey, externalKey))))[0]!;
const history = async (id: string) =>
  (await db.select().from(schema.priceHistory).where(eq(schema.priceHistory.priceItemId, id)).orderBy(desc(schema.priceHistory.recordedAt))).map((h) => [h.unitPrice, h.note]);
const withValue = (key: string, unitPrice: string, year: string) => records.map((r) => (r.externalKey === key ? { ...r, unitPrice, period: year, priceDate: `${year}-07-01`, series: { ...r.series, [year]: Number(unitPrice) } } : r));

describe("Lots d'import contrôlés et réversibles", () => {
  it("publie un premier chargement avec sa provenance et met en quarantaine une valeur aberrante", async () => {
    const sources = await ensureSources(db);
    matnuhpv = sources.find((s) => s.key === "matnuhpv-materiaux")!;
    records = await parseMatnuhpv(await matnuhpvFixtures());
    const outlier: SourceRecord = { ...byKey(records, "agglo-berrechid:ciment-cpj-45-cpj-45"), externalKey: "agglo-had-soualem:ciment-cpj-45-cpj-45", city: "Had Soualem", unitPrice: "9900" };
    const batch = await stageBatch(db, { source: matnuhpv, records: [...records, outlier], label: "Instantané de test", trigger: "instantane", resources: [] });
    expect(batch).toMatchObject({ status: "quarantaine", stats: { lues: 8, nouvelles: 8, publiees: 7, quarantaine: 1 } });
    const casa = await item("agglo-casablanca:ciment-cpj-45-cpj-45");
    expect(casa).toMatchObject({ origin: "donnees_publiques", unitPrice: "1720.0000", taxBasis: "TTC", vatRate: "20.0000", verificationStatus: "a_verifier", importBatchId: batch.id, license: matnuhpv.license });
    expect(casa.verifiedAt).toBeTruthy();
    expect(await history(casa.id)).toEqual([["1720.0000", "Création, Instantané de test"]]);
    const [row] = await db.select().from(schema.priceImportRow).where(eq(schema.priceImportRow.batchId, batch.id));
    expect(row).toMatchObject({ externalKey: "agglo-had-soualem:ciment-cpj-45-cpj-45", decision: "quarantaine" });
    // Références sœurs : le ciment des autres zones (national, région, trois agglomérations).
    expect(row!.reason).toMatch(/^Valeur 5,9 fois supérieure à la médiane des 5 références sœurs/);
    // La valeur écartée n'est jamais publiée.
    await rejectRows(db, batch.id, [row!.id]);
    expect((await db.select().from(schema.priceImportBatch).where(eq(schema.priceImportBatch.id, batch.id)))[0]).toMatchObject({ status: "publie" });
    expect(await db.select().from(schema.priceItem).where(eq(schema.priceItem.externalKey, outlier.externalKey))).toEqual([]);
  });

  it("ne réécrit rien pour des valeurs inchangées et date leur vérification", async () => {
    const before = await item("agglo-casablanca:ciment-cpj-45-cpj-45");
    const batch = await stageBatch(db, { source: matnuhpv, records, label: "Relecture", trigger: "actualisation", resources: [] });
    expect(batch).toMatchObject({ status: "sans_changement", stats: { inchangees: 7, nouvelles: 0, modifiees: 0 } });
    const after = await item("agglo-casablanca:ciment-cpj-45-cpj-45");
    expect(after.verifiedAt!.getTime()).toBeGreaterThanOrEqual(before.verifiedAt!.getTime());
    expect(await history(after.id)).toHaveLength(1);
  });

  it("publie une nouvelle année plausible, met en quarantaine une hausse anormale, puis publie sur décision", async () => {
    const key = "agglo-casablanca:ciment-cpj-45-cpj-45";
    const plausible = await stageBatch(db, { source: matnuhpv, records: withValue(key, "1800", "2023"), label: "Actualisation 2023", trigger: "actualisation", resources: [] });
    expect(plausible).toMatchObject({ status: "publie", stats: { modifiees: 1, publiees: 1 } });
    expect(await item(key)).toMatchObject({ unitPrice: "1800.0000", period: "2023" });

    records = withValue(key, "1800", "2023");
    const suspicious = await stageBatch(db, { source: matnuhpv, records: withValue(key, "3240", "2024"), label: "Actualisation 2024", trigger: "actualisation", resources: [] });
    expect(suspicious).toMatchObject({ status: "quarantaine", stats: { modifiees: 1, quarantaine: 1, publiees: 0 } });
    const [row] = await db.select().from(schema.priceImportRow).where(and(eq(schema.priceImportRow.batchId, suspicious.id), eq(schema.priceImportRow.decision, "quarantaine")));
    // 1 800 puis 3 240 un an plus tard : +79,8 % par an (année 2024 bissextile comprise).
    expect(row!.reason).toMatch(/^Variation de \+79,8 % par an depuis la valeur publiée, au-delà du seuil de 30 %/);
    expect((await item(key)).unitPrice).toBe("1800.0000");
    const published = await publishRows(db, suspicious.id, [row!.id]);
    expect(published).toMatchObject({ status: "publie", stats: { publiees: 1, quarantaine: 0 } });
    expect(await item(key)).toMatchObject({ unitPrice: "3240.0000", period: "2024", verificationStatus: "a_verifier" });
  });

  it("annule le dernier lot en rétablissant la valeur remplacée, jamais un lot plus ancien d'abord", async () => {
    const key = "agglo-casablanca:ciment-cpj-45-cpj-45";
    const batches = await db.select().from(schema.priceImportBatch).where(eq(schema.priceImportBatch.sourceId, matnuhpv.id));
    const initial = batches.find((b) => b.label === "Instantané de test")!;
    const last = batches.find((b) => b.label === "Actualisation 2024")!;
    await expect(revertBatch(db, initial.id)).rejects.toThrow(/plus récent/);
    expect(await revertBatch(db, last.id)).toMatchObject({ status: "annule" });
    const restored = await item(key);
    expect(restored).toMatchObject({ unitPrice: "1800.0000", period: "2023" });
    expect((await history(restored.id))[0]).toEqual(["1800.0000", "Annulation, Actualisation 2024"]);
  });

  it("archive les références d'un chargement annulé et les restaure s'il est rejoué", async () => {
    const batches = await db.select().from(schema.priceImportBatch).where(eq(schema.priceImportBatch.sourceId, matnuhpv.id));
    await revertBatch(db, batches.find((b) => b.label === "Actualisation 2023")!.id);
    await revertBatch(db, batches.find((b) => b.label === "Instantané de test")!.id);
    const archived = await db.select().from(schema.priceItem).where(eq(schema.priceItem.sourceId, matnuhpv.id));
    expect(archived.every((x) => x.archivedAt !== null)).toBe(true);

    const replay = await stageBatch(db, { source: matnuhpv, records: await parseMatnuhpv(await matnuhpvFixtures()), label: "Nouveau chargement", trigger: "instantane", resources: [] });
    expect(replay).toMatchObject({ status: "publie", stats: { nouvelles: 7, publiees: 7 } });
    const revived = await item("agglo-casablanca:ciment-cpj-45-cpj-45");
    expect(revived).toMatchObject({ archivedAt: null, unitPrice: "1720.0000", importBatchId: replay.id });

    // Une référence archivée par l'utilisateur n'est plus touchée par les imports.
    await db.update(schema.priceItem).set({ archivedAt: new Date() }).where(eq(schema.priceItem.id, revived.id));
    const analysis = await analyze(db, matnuhpv, withValue("agglo-casablanca:ciment-cpj-45-cpj-45", "1750", "2023"));
    expect(analysis.ignored).toBe(1);
    await db.update(schema.priceItem).set({ archivedAt: null }).where(eq(schema.priceItem.id, revived.id));
  });
});

describe("Prix candidats, filtres et références publiques", () => {
  it("préfère la ville de l'affaire, puis sa région, puis le niveau national, et ramène le prix TTC hors taxes", async () => {
    const settat = await findCandidates(db, { text: "Ciment CPJ 45 pour béton", currency: "MAD", country: "MA", city: "Settat" });
    expect(settat).toHaveLength(2);
    const ciment = settat.find((c) => c.designation === "Ciment CPJ 45")!;
    // 1 650 TTC ÷ 1,20 = 1 375 HT.
    expect(ciment).toMatchObject({ zone: "Settat", unitPrice: "1650.0000", unitPriceHt: "1375.0000", taxBasis: "TTC", scope: "fourniture" });
    const unknownCity = await findCandidates(db, { text: "Ciment CPJ 45", currency: "MAD", country: "MA", city: "Bouskoura" });
    expect(unknownCity.find((c) => c.designation === "Ciment CPJ 45")).toMatchObject({ zone: null, unitPrice: "1480.0000", unitPriceHt: "1233.3333" });
    // Un prix de matériau ne chiffre jamais directement une ligne de DPGF.
    expect(await findCandidates(db, { text: "Ciment CPJ 45", currency: "MAD", country: "MA", purpose: "ligne" })).toEqual([]);
  });

  it("charge une source depuis son instantané et filtre par source, région, nature et fiabilité", async () => {
    const res = await admin.request("/api/admin/library/sources/cdc-logement-social/load", { method: "POST" });
    expect(res.status).toBe(202);
    const sources = (await admin.request("/api/admin/library/sources")).json.items as Array<{ key: string; references: number; pending: number; snapshot: { references: number } | null; lastBatch: { status: string } | null }>;
    const cdc = sources.find((s) => s.key === "cdc-logement-social")!;
    // Les deux ratios de réhabilitation de Nouvelle-Calédonie, près de quatre fois la médiane des autres régions, attendent une décision.
    expect(cdc.pending).toBe(2);
    expect(cdc.references + cdc.pending).toBe(cdc.snapshot!.references);
    expect(cdc.lastBatch!.status).toBe("quarantaine");
    const list = (await admin.request("/api/admin/library/prices?source=cdc-logement-social&region=bretagne&pageSize=50")).json as { items: Array<{ kind: string; region: string; sourceName: string; unit: string }>; total: number };
    expect(list.total).toBeGreaterThanOrEqual(2);
    expect(list.items.every((i) => i.kind === "ratio" && i.region === "Bretagne" && i.sourceName.startsWith("Coûts et surfaces"))).toBe(true);
    expect((await admin.request("/api/admin/library/prices?source=matnuhpv-materiaux&ville=Settat")).json.total).toBe(1);
    expect((await admin.request("/api/admin/library/prices?source=personnel")).json.total).toBe(0);
    const facets = (await admin.request("/api/admin/library/facets?pays=MA")).json as { regions: string[]; cities: Array<{ city: string }> };
    expect(facets.regions).toContain("Casablanca-Settat");
    expect(facets.cities.map((c) => c.city)).toEqual(expect.arrayContaining(["Casablanca", "Settat", "Berrechid"]));
  });

  it("protège la valeur d'une référence publique, permet de la dupliquer, de la comparer et repère les doublons", async () => {
    const casa = await item("agglo-casablanca:ciment-cpj-45-cpj-45");
    const patch = await admin.request(`/api/admin/library/prices/${casa.id}`, { method: "PATCH", body: { unitPrice: "1" } });
    expect(patch.status).toBe(409);
    const copy = await admin.request(`/api/admin/library/prices/${casa.id}/duplicate`, { method: "POST" });
    expect(copy.status).toBe(201);
    expect(copy.json.price).toMatchObject({ sourceId: null, externalKey: null, designation: "Ciment CPJ 45", origin: "donnees_publiques", unitPrice: "1720.0000" });
    expect((await admin.request(`/api/admin/library/prices/${copy.json.price.id}`, { method: "PATCH", body: { unitPrice: "1600" } })).status).toBe(200);

    const compare = (await admin.request(`/api/admin/library/prices/${casa.id}/compare`)).json.items as Array<{ city: string | null; region: string | null }>;
    expect(compare.map((c) => c.city ?? c.region ?? "national")).toEqual(expect.arrayContaining(["Casablanca", "Settat", "Berrechid", "Casablanca-Settat", "national"]));
    const duplicates = (await admin.request("/api/admin/library/duplicates?pays=MA")).json.groups as Array<{ count: number; items: Array<{ id: string }> }>;
    expect(duplicates.some((g) => g.items.some((i) => i.id === casa.id) && g.items.some((i) => i.id === copy.json.price.id))).toBe(true);
  });

  it("refuse un prix TTC sans taux de TVA", async () => {
    const res = await admin.request("/api/admin/library/prices", {
      body: { designation: "Carrelage grès cérame", kind: "materiau", unit: "m2", unitPrice: "120", currency: "MAD", country: "MA", origin: "devis_fournisseur", priceDate: "2026-09-01", taxBasis: "TTC" },
    });
    expect(res.status).toBe(400);
    expect(res.json.fields.vatRate).toMatch(/taux de TVA/);
  });

  it("annule un import de fichier entier : les prix sont archivés, jamais supprimés", async () => {
    const file = Buffer.from("Désignation;Unité;Prix\nTreillis soudé ST25;m2;32\nFil recuit;kg;18\n", "utf-8").toString("base64");
    const res = await admin.request("/api/admin/library/prices/import", {
      body: { fileName: "tarif.csv", contentBase64: file, headerRow: 0, columns: { designation: 0, unit: 1, unitPrice: 2, code: null, kind: null, priceDate: null }, defaults: { kind: "materiau", currency: "MAD", country: "MA", origin: "devis_fournisseur", priceDate: "2026-09-01", tradeFamily: null, supplierId: null } },
    });
    expect(res.json).toMatchObject({ imported: 2 });
    const files = (await admin.request("/api/admin/library/batches?source=fichiers")).json.items as Array<{ id: string; label: string; status: string }>;
    expect(files[0]).toMatchObject({ id: res.json.batchId, label: "Fichier tarif.csv", status: "publie" });
    expect((await admin.request(`/api/admin/library/batches/${res.json.batchId}/revert`, { method: "POST" })).json.batch.status).toBe("annule");
    const kept = await db.select().from(schema.priceItem).where(eq(schema.priceItem.importBatchId, res.json.batchId));
    expect(kept).toHaveLength(2);
    expect(kept.every((x) => x.archivedAt !== null)).toBe(true);
  });
});

describe("Rapprochement d'une DPGF avec la bibliothèque", () => {
  it("propose les prix d'ouvrage de même unité, applique le prix hors taxes avec sa provenance et refuse un prix de matériau", async () => {
    expect((await admin.request("/api/admin/library/sources/ademe-renovation/load", { method: "POST" })).status).toBe(202);
    const project = await admin.request("/api/admin/projects", { body: { name: "Rénovation de logements", country: "FR", marketType: "consultation_privee", sector: "prive", currency: "EUR", city: "Rennes" } });
    expect(project.status).toBe(201);
    const projectId = project.json.project.id as string;
    const [dpgf] = await db.insert(schema.dpgf).values({ projectId, title: "DPGF rénovation", currency: "EUR" }).returning();
    const [chapter] = await db.insert(schema.dpgfLine).values({ dpgfId: dpgf!.id, position: 1, kind: "chapitre", code: "1", designation: "Isolation" }).returning();
    const [combles, fenetres] = await db
      .insert(schema.dpgfLine)
      .values([
        { dpgfId: dpgf!.id, parentId: chapter!.id, position: 2, kind: "poste", code: "1.1", designation: "Isolation des combles perdus en laine minérale soufflée", unit: "m2", quantity: "120" },
        { dpgfId: dpgf!.id, parentId: chapter!.id, position: 3, kind: "poste", code: "1.2", designation: "Fenêtre PVC double vitrage", unit: "ml", quantity: "10" },
      ])
      .returning();

    const matches = await admin.request(`/api/admin/dpgf/${dpgf!.id}/price-matches`, { body: {} });
    expect(matches.status).toBe(200);
    const items = matches.json.items as Array<{ lineId: string; candidates: Array<{ id: string; designation: string; unit: string; unitPriceHt: string; scope: string }> }>;
    const forCombles = items.find((i) => i.lineId === combles!.id)!;
    expect(forCombles.candidates.length).toBeGreaterThan(0);
    expect(forCombles.candidates.every((cand) => cand.unit === "m²" && cand.scope === "fourniture_pose")).toBe(true);
    const best = forCombles.candidates.find((cand) => cand.designation === "Isolation des combles perdus en laine minérale, fourniture et pose")!;
    expect(best).toBeTruthy();
    // Unité du poste en mètres linéaires : aucun prix de fenêtre à l'unité ne s'applique.
    expect(items.find((i) => i.lineId === fenetres!.id)!.candidates).toEqual([]);

    const ciment = await item("agglo-casablanca:ciment-cpj-45-cpj-45");
    const applied = await admin.request(`/api/admin/dpgf/${dpgf!.id}/apply-prices`, {
      body: { assignments: [{ lineId: combles!.id, priceItemId: best.id }, { lineId: fenetres!.id, priceItemId: ciment.id }] },
    });
    expect(applied.json.applied).toBe(1);
    expect(applied.json.errors).toEqual([{ lineId: fenetres!.id, message: "Prix en MAD pour MA, DPGF en EUR." }]);
    const [line] = await db.select().from(schema.dpgfLine).where(eq(schema.dpgfLine.id, combles!.id));
    expect(line).toMatchObject({ unitPrice: best.unitPriceHt, priceItemId: best.id, status: "a_verifier" });
    expect(Number(line!.amount)).toBeCloseTo(Number(best.unitPriceHt) * 120, 2);
    expect(line!.priceSource).toMatch(/^Bibliothèque : Isolation des combles perdus en laine minérale, fourniture et pose, valeur 2009 à 2018, Coûts des travaux de rénovation énergétique$/);
    // Le contrôle qualité signale un prix de bibliothèque à vérifier et ancien.
    const issues = await db.select().from(schema.qualityIssue).where(eq(schema.qualityIssue.documentId, dpgf!.id));
    expect(issues.map((i) => i.message)).toEqual(expect.arrayContaining([expect.stringMatching(/^Prix de bibliothèque à vérifier : Isolation des combles/), expect.stringMatching(/^Prix de bibliothèque de plus de \d+ mois/)]));
  });
});

describe("Actualisation des sources", () => {
  it("ne relit rien quand les ressources officielles n'ont pas changé, relit et contrôle sinon", async () => {
    const [cdc] = await db.select().from(schema.priceSource).where(eq(schema.priceSource.key, "cdc-logement-social"));
    const values = async () =>
      ((await admin.request("/api/admin/library/prices?source=cdc-logement-social&region=Bretagne&pageSize=50")).json.items as Array<{ externalKey: string; unitPrice: string }>)
        .map((i) => [i.externalKey, i.unitPrice])
        .sort();
    const before = await values();
    const same = new TextEncoder().encode("contenu identique");
    await db
      .update(schema.priceSource)
      .set({ resources: cdc!.resources.map((r) => ({ ...r, sha256: createHash("sha256").update(same).digest("hex") })) })
      .where(eq(schema.priceSource.id, cdc!.id));
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(same));
    await admin.request("/api/admin/library/sources/cdc-logement-social/refresh", { method: "POST" });
    const unchanged = (await admin.request("/api/admin/library/batches?source=cdc-logement-social")).json.items[0];
    expect(unchanged).toMatchObject({ status: "sans_changement", trigger: "actualisation" });

    // Nouvelle publication : la Bretagne gagne une année ; les autres régions disparaissent du fichier.
    const csv = [
      "code_region;region;annee_signature;Construction - Prix de revient médian au M² des opérations",
      "53;BRETAGNE;2026;2700",
    ].join("\n");
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(csv));
    await admin.request("/api/admin/library/sources/cdc-logement-social/refresh", { method: "POST" });
    const reduced = (await admin.request("/api/admin/library/batches?source=cdc-logement-social")).json.items[0];
    // Lot nettement plus réduit que les références publiées : rien n'est publié d'office.
    expect(reduced).toMatchObject({ status: "quarantaine" });
    expect(reduced.message).toMatch(/rien n’a été publié d’office/);
    expect(await values()).toEqual(before);
  });

  it("planifie la vérification d'une source chargée dont l'intervalle est dépassé, jamais d'une source jamais chargée", async () => {
    setJobKickerForTests(async () => {});
    await db
      .update(schema.priceSource)
      .set({ lastCheckedAt: new Date(Date.now() - 40 * 86_400_000) })
      .where(eq(schema.priceSource.key, "matnuhpv-materiaux"));
    await db.update(schema.priceSource).set({ lastCheckedAt: null }).where(eq(schema.priceSource.key, "ademe-renovation"));
    await db.update(schema.priceSource).set({ lastCheckedAt: new Date() }).where(eq(schema.priceSource.key, "cdc-logement-social"));
    expect(await scheduleSourceChecks(db)).toBe(1);
    const jobs = await db.select().from(schema.generationJob).where(and(eq(schema.generationJob.kind, "import_prix"), eq(schema.generationJob.status, "en_attente")));
    expect(jobs.map((j) => j.input)).toEqual([{ sourceKey: "matnuhpv-materiaux", mode: "actualisation", trigger: "planifie" }]);
    setJobKickerForTests(async (id) => {
      await runJob(id);
    });
  });
});
