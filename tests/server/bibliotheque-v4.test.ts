/**
 * Bibliothèque de prix, amélioration V4 : salaires minimaux et indemnités du BTP (base KALI, SMIC de l'Insee),
 * prix des carburants, salaire minimum légal marocain ; prix historiques jamais appliqués d'office ; filtre
 * par lot ; prix déjà appliqués conservés en instantané quand la bibliothèque change.
 */
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { SourceRecord } from "../../shared/prices.js";
import { isHistoricalPrice } from "../../shared/prices.js";
import { type Database, schema } from "../../server/db/index.js";
import { runJob, setJobKickerForTests } from "../../server/jobs/runner.js";
import { parseCarburants } from "../../server/services/price-sources/carburants.js";
import { decimal } from "../../server/services/price-sources/common.js";
import { sourceByKey, stageBatch } from "../../server/services/price-sources/engine.js";
import { initialLoad, libraryCounts } from "../../server/services/price-sources/initial-load.js";
import { parseKali } from "../../server/services/price-sources/kali.js";
import { readSnapshot } from "../../server/services/price-sources/snapshot.js";
import { wageInText } from "../../server/services/price-sources/smig.js";
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

/** Texte sans espaces insécables, pour comparer des montants mis en forme à la française. */
const plain = (text: string) => text.replace(/[  ]/g, " ");

const byKey = (records: SourceRecord[], key: string) => {
  const found = records.find((r) => r.externalKey === key);
  if (!found) throw new Error(`Référence absente : ${key}`);
  return found;
};

/* ---------- Copie JSON de la base KALI ---------- */

const article = (content: string) => ({ type: "article", data: { content } });
const salaryText = (id: string, title: string, etat: string, ...contents: string[]) => ({ type: "section", data: { id, title, etat }, children: contents.map(article) });
const convention = (...texts: unknown[]) => ({ type: "convention collective", data: { title: "Convention" }, children: [{ type: "section", data: { title: "Textes Salaires" }, children: texts }] });
const table = (rows: string[][], header?: string[]) =>
  `<table><tbody>${header ? `<tr>${header.map((h) => `<th>${h}</th>`).join("")}</tr>` : ""}${rows.map((r) => `<tr>${r.map((c) => (c.startsWith("<td") ? c : `<td>${c}</td>`)).join("")}</tr>`).join("")}</tbody></table>`;

const BRETAGNE_2026 = table(
  [
    ["– position 1", "150", "1 863,43", "12,29"],
    ["– position 2", "170", "1 868,17", "12,32"],
    ["Ouvriers professionnels", "185", "1 917,70", "12,64"],
    ["– position 1", "210", "2 064,78", "13,61"],
    ["– position 2", "230", "2 234,67", "14,73"],
    ["– position 1", "250", "2 404,54", "15,85"],
    ["– position 2", "270", "2 574,41", "16,97"],
  ],
  ["Catégorie professionnelle", "Coefficient", "Salaire mensuel minimal", "Taux horaire"],
);
const scale = (base: number) => table([150, 170, 185, 210, 230, 250, 270].map((coef, i) => [`Position ${i}`, String(coef), `${(base + i * 100).toLocaleString("fr-FR")} €`]), ["Catégorie", "Coefficient", "Salaire mensuel minimal"]);

function buildingWorkers() {
  return convention(
    salaryText("T-BRE-2025", "Bretagne Accord du 3 décembre 2024 relatif aux salaires minimaux au 1er janvier 2025", "VIGUEUR_ETEN", scale(1700)),
    salaryText("T-BRE-2026", "Bretagne Accord du 27 novembre 2025 relatif aux salaires minimaux au 1er janvier 2026", "VIGUEUR_ETEN", `<p>À compter du 1er janvier 2026 :</p>${BRETAGNE_2026}`),
    salaryText("T-BRE-2027", "Bretagne Accord du 1er octobre 2026 relatif aux salaires minimaux au 1er janvier 2027", "VIGUEUR_NON_ETEN", scale(1900)),
    salaryText("T-HDF", "Hauts-de-France Accord du 1er décembre 2025 relatif aux salaires", "VIGUEUR_NON_ETEN", table([150, 170, 185, 210, 230, 250, 270].map((c, i) => [String(c), `${[1832, 1857, 1955, 2111, 2269, 2469, 2650][i]!.toLocaleString("fr-FR")} €`]), ["Coefficient", "Au 1er janvier 2026"])),
    // Barème incomplet : trois coefficients seulement, écarté.
    salaryText("T-NOR", "Normandie Accord du 10 février 2026 relatif aux salaires au 1er avril 2026", "VIGUEUR_ETEN", table([["P1", "150", "1 823 €"], ["P2", "170", "1 845 €"], ["N2", "185", "1 884 €"]])),
    salaryText(
      "T-BRE-IPD",
      "Accord du 27 novembre 2025 relatif aux indemnités de petits déplacements au 1er janvier 2026 (Bretagne)",
      "VIGUEUR_ETEN",
      `<p>Pour les départements Côtes d'Armor, Finistère, Ille-et-Vilaine, Morbihan à compter du 1er janvier 2026 :</p>${table(
        [
          ["1 A", "De 0 à 4 km", "0,47 €", "0,58 €", "[1]"],
          ["1 B", "De 4 à 10 km", "1,51 €", "2,86 €", '<td rowspan="5">12,30 €</td>'],
          ["2", "De 10 à 20 km", "2,08 €", "5,73 €"],
          ["3", "De 20 à 30 km", "3,11 €", "7,86 €"],
          ["4", "De 30 à 40 km", "4,36 €", "10,08 €"],
          ["5", "De 40 à 50 km", "5,21 €", "12,27 €"],
          ['<td colspan="5">[1] L\'ouvrier qui travaille dans la première sous-zone est réputé prendre son repas à sa résidence.</td>'],
        ],
        ["Zones", "Distance", "Indemnité de trajet", "Indemnité de transport", "Indemnité de repas"],
      )}`,
    ),
    salaryText(
      "T-DA",
      "Drôme-Ardèche Accord du 10 décembre 2025 relatif au barème d'indemnités de petits déplacements",
      "VIGUEUR_ETEN",
      `<p>Pour les départements de la Drôme et de l'Ardèche, à compter du 1er janvier 2026 : – l'indemnité de repas est portée à : 12 € ; – les indemnités de transport et de trajet comme dans le tableau ci-après :</p><table><tbody><tr><th colspan="6">Indemnités de frais de transport</th><th colspan="6">Indemnités de trajet</th></tr><tr>${["Zone 1a 0 à 5 km", "Zone 1b 5 à 10 km", "Zone 2 10 à 20 km", "Zone 3 20 à 30 km", "Zone 4 30 à 40 km", "Zone 5 40 à 50 km"].map((z) => `<th>${z}</th>`).join("").repeat(2)}</tr><tr>${["1,90 €", "3,20 €", "6,03 €", "9,68 €", "13,57 €", "17,30 €", "0,85 €", "1,49 €", "2,96 €", "4,27 €", "5,80 €", "7,10 €"].map((v) => `<td>${v}</td>`).join("")}</tr></tbody></table>`,
    ),
    salaryText(
      "T-PACA",
      "PACA Accord du 30 septembre 2024 relatif à l'indemnité de petits déplacements",
      "VIGUEUR_ETEN",
      "<p>La date d'application du présent accord est fixée au : 1er novembre 2024.</p>",
      "<p>Le montant de l'indemnité de repas est fixé à 12,20 €.</p>",
      "<p>Le montant de l'indemnité de frais de transport est fixé comme suit : Zone 1 (0 à 10 km) 3,65 €. Zone 2 (10 à 20 km) 6,42 €. Zone 3 (20 à 30 km) 8,63 €. Zone 4 (30 à 40 km) 11,26 €. Zone 5 (40 à 50 km) 14,80 €.</p>",
      "<p>Le montant de l'indemnité de trajet est fixé comme suit : Zone 1 (0 à 10 km) 2,05 €. Zone 2 (10 à 20 km) 3,25 €. Zone 3 (20 à 30 km) 4,38 €. Zone 4 (30 à 40 km) 5,81 €. Zone 5 (40 à 50 km) 6,90 €.</p>",
    ),
  );
}

const publicWorks = () =>
  convention(
    salaryText(
      "T-TP-PDL",
      "Pays de la Loire Accord du 4 décembre 2025 relatif aux salaires minima hiérarchiques pour 2026",
      "VIGUEUR_ETEN",
      `<p>Les salaires minima hiérarchiques annuels, dans ses limites territoriales en vigueur au 31 décembre 2015, sont les suivants :</p>${table([
        ["Coefficient", "100", "110", "125", "140", "150", "165", "180"],
        ["Niveau/Position", "I-1", "I-2", "II-1", "II-2", "III-1", "III-2", "IV"],
        ["Salaires minima hiérarchiques Base 35 heures", "23 537", "23 733", "24 749", "27 334", "29 301", "31 743", "34 619"],
      ])}`,
    ),
  );

const etam = () =>
  convention(salaryText("T-ETAM-IDF", "Île-de-France Accord du 5 novembre 2025 relatif aux salaires minimaux", "VIGUEUR_ETEN", table(["A", "B", "C", "D", "E", "F", "G", "H"].map((l, i) => [`Niveau ${l}`, `${(1843 + i * 200).toLocaleString("fr-FR")} €`]))));

const SMIC_XML = `<Series IDBANK="000822484"><Obs TIME_PERIOD="2026-07" OBS_VALUE="12.31"/><Obs TIME_PERIOD="2026-06" OBS_VALUE="12.31"/><Obs TIME_PERIOD="2026-05" OBS_VALUE="12.02"/><Obs TIME_PERIOD="2026-01" OBS_VALUE="12.02"/><Obs TIME_PERIOD="2025-12" OBS_VALUE="11.88"/></Series>`;

describe("Salaires minimaux et indemnités du BTP", () => {
  const records = parseKali(
    [
      { url: "https://kali.test/1597.json", title: "IDCC 1597", idcc: "1597", json: buildingWorkers() },
      { url: "https://kali.test/1702.json", title: "IDCC 1702", idcc: "1702", json: publicWorks() },
      { url: "https://kali.test/2609.json", title: "IDCC 2609", idcc: "2609", json: etam() },
    ],
    { url: "https://bdm.insee.fr/series/sdmx/data/SERIES_BDM/000822484", title: "SMIC", xml: SMIC_XML },
    { today: "2026-10-12" },
  );

  it("reprend le dernier accord en vigueur, porte au SMIC un minimum inférieur et annonce le barème à venir", () => {
    expect(byKey(records, "smic:horaire")).toMatchObject({ unitPrice: "12.31", priceDate: "2026-06-01", unit: "h", kind: "main_oeuvre", scope: null, regulated: true, series: { "2025-12": 11.88, "2026-01": 12.02, "2026-06": 12.31 } });
    const p1 = byKey(records, "kali:1597:salaire:bretagne::coef-150");
    // 12,29 € de l'accord, inférieur au SMIC de 12,31 € en vigueur depuis le 1er juin 2026.
    expect(p1).toMatchObject({ unitPrice: "12.31", valueStatus: "calculee", priceDate: "2026-06-01", region: "Bretagne", unit: "h", regulated: true, taxBasis: null, reliability: "haute" });
    expect(p1.description).toContain("le SMIC s’applique");
    expect(plain(p1.description)).toContain("À compter du 1er janvier 2027 : 1 900 € par mois");
    expect(p1.sourceUrl).toBe("https://www.legifrance.gouv.fr/conv_coll/id/T-BRE-2026");
    expect(byKey(records, "kali:1597:salaire:bretagne::coef-170")).toMatchObject({ unitPrice: "12.32", valueStatus: "source", priceDate: "2026-01-01", designation: "Salaire horaire minimal, ouvrier du bâtiment, niveau I position 2, coefficient 170" });
    // Accord non étendu : repris avec sa mention ; salaire mensuel ramené à l'heure sur 151,67 heures.
    const hdf = byKey(records, "kali:1597:salaire:hauts-de-france::coef-185");
    expect(hdf.unitPrice).toBe(decimal(1955 / 151.67));
    expect(hdf.description).toContain("Accord non étendu");
    // Barème incomplet : rien n'est repris pour la Normandie.
    expect(records.some((r) => r.externalKey.startsWith("kali:1597:salaire:normandie"))).toBe(false);
    expect(records.every((r) => !/[()]/.test(r.description) && !/[()]/.test(r.designation))).toBe(true);
  });

  it("lit les indemnités en lignes, en colonnes ou en phrases, repas compris", () => {
    expect(byKey(records, "kali:1597:indemnite:bretagne::trajet-zone-1a")).toMatchObject({ unitPrice: "0.47", unit: "jour", designation: "Indemnité de trajet, zone 1A de 0 à 4 km, ouvrier du bâtiment", priceDate: "2026-01-01" });
    expect(byKey(records, "kali:1597:indemnite:bretagne::transport-zone-5")).toMatchObject({ unitPrice: "12.27" });
    expect(byKey(records, "kali:1597:indemnite:bretagne::repas")).toMatchObject({ unitPrice: "12.3" });
    expect(records.filter((r) => r.externalKey.startsWith("kali:1597:indemnite:bretagne:"))).toHaveLength(13);
    expect(byKey(records, "kali:1597:indemnite:auvergne-rhone-alpes:drome-et-ardeche:transport-zone-1a")).toMatchObject({ unitPrice: "1.9", region: "Auvergne-Rhône-Alpes" });
    expect(byKey(records, "kali:1597:indemnite:auvergne-rhone-alpes:drome-et-ardeche:trajet-zone-5")).toMatchObject({ unitPrice: "7.1" });
    expect(byKey(records, "kali:1597:indemnite:auvergne-rhone-alpes:drome-et-ardeche:repas")).toMatchObject({ unitPrice: "12", designation: "Indemnité de repas, ouvrier du bâtiment, Drôme et Ardèche" });
    expect(byKey(records, "kali:1597:indemnite:provence-alpes-cote-d-azur::transport-zone-1")).toMatchObject({ unitPrice: "3.65", priceDate: "2024-11-01" });
    expect(byKey(records, "kali:1597:indemnite:provence-alpes-cote-d-azur::repas")).toMatchObject({ unitPrice: "12.2" });
  });

  it("lit un barème des travaux publics en colonnes et les niveaux des ETAM", () => {
    expect(byKey(records, "kali:1702:salaire:pays-de-la-loire::coef-100")).toMatchObject({ unitPrice: decimal(23537 / 1820), valueStatus: "calculee", priceDate: "2026-01-01" });
    expect(plain(byKey(records, "kali:1702:salaire:pays-de-la-loire::coef-180").attributes.salaireAnnuel!)).toBe("34 619,00 €");
    expect(byKey(records, "kali:2609:salaire:ile-de-france::niveau-h")).toMatchObject({ unitPrice: decimal((1843 + 7 * 200) / 151.67), designation: "Salaire horaire minimal, ETAM du bâtiment, niveau H" });
  });
});

describe("Carburants et salaire minimum marocain", () => {
  it("retient la médiane des prix récents par région, TVA de 13 % en Corse", () => {
    const rows = ["id;gazole_prix;gazole_maj;e10_prix;e10_maj;code_region;region"];
    for (let i = 0; i < 25; i++) rows.push(`${i};${(2.3 + i * 0.01).toFixed(3)};2026-10-1${i % 3}T08:00:00+00:00;;;53;Bretagne`);
    // Affichages anciens de plus d'une semaine : écartés.
    for (let i = 0; i < 5; i++) rows.push(`old${i};3.100;2026-09-20T08:00:00+00:00;;;53;Bretagne`);
    for (let i = 0; i < 20; i++) rows.push(`co${i};2.250;2026-10-11T08:00:00+00:00;;;94;Corse`);
    const records = parseCarburants({ url: "https://data.economie.gouv.fr/test.csv", title: "Flux", text: rows.join("\n") });
    expect(byKey(records, "carburants:gazole:bretagne")).toMatchObject({ unitPrice: "2.42", sampleSize: 25, taxBasis: "TTC", vatRate: "20", unit: "l", kind: "materiau", scope: "fourniture", priceDate: "2026-10-12", reliability: "faible" });
    expect(byKey(records, "carburants:gazole:corse")).toMatchObject({ unitPrice: "2.25", vatRate: "13" });
    expect(byKey(records, "carburants:gazole:national").sampleSize).toBe(45);
    expect(records.some((r) => r.externalKey.startsWith("carburants:e10"))).toBe(false);
  });

  it("lit le montant horaire du SMIG et sa date d'effet dans le décret, quelle que soit la mise en page", () => {
    // Texte tel qu'extrait du Bulletin officiel n° 7469 : ligatures lam-alif décomposées dans le désordre.
    const page =
      "مرسوم رقم 2.25.983 صادر في 8 رجب 1447 ( 29 ديسمبر 2025 ) بتحديد مبلغ الحد األدنى القانوني لألجر في النشاطات الفالحية وغيرالفالحية. املـادة األولـى ابتداء من فاتح يناير 2026 ، يحدد في سبعة عشر درهما واثنان وتسعون سنتيما ( 17,92 درهما)، مبلغ الحد األدنى القانوني لألجر املؤدى لألجراء عن ساعة الشغل في النشاطات غير الفالحية. املادة الثانيــة ابتداء من فاتح أبريل 2026 ، يحدد في سبعة وتسعين درهما وأربعة وأربعين سنتيما ( 97,44 درهما)، مبلغ الحد األدنى القانوني لألجر املؤدى لألجراء عن يوم شغل في النشاطات الفالحية.";
    expect(wageInText(page, null)).toEqual({ decree: "2.25.983", hourly: 17.92, since: "2026-01-01" });
    // Intitulé illisible : numéro du décret repris du catalogue.
    expect(wageInText(page.replace("مرسوم رقم 2.25.983", "م 6 سوم (ج قم"), "2.24.1122")).toMatchObject({ decree: "2.24.1122", hourly: 17.92 });
    // Seul l'article agricole : rien n'est lu.
    expect(wageInText(page.slice(page.indexOf("املادة الثانيــة")), null)).toBeNull();
  });
});

/* ---------- Règles de la bibliothèque ---------- */

async function price(values: Partial<typeof schema.priceItem.$inferInsert> & { designation: string }) {
  const [row] = await db
    .insert(schema.priceItem)
    .values({ kind: "ouvrage", unit: "m2", unitPrice: "50", currency: "EUR", country: "FR", origin: "saisie_manuelle", priceDate: "2026-09-01", priceScope: "fourniture_pose", ...values })
    .returning();
  return row!;
}

describe("Prix historiques", () => {
  it("ne propose jamais un prix historique à un chiffrage automatique, le signale dans un choix manuel", async () => {
    await price({ designation: "Coffreur bancheur, taux horaire ancien", kind: "main_oeuvre", unit: "h", unitPrice: "30", priceDate: "2019-03-01", priceScope: null });
    await price({ designation: "Coffreur bancheur, salaire minimal en vigueur", kind: "main_oeuvre", unit: "h", unitPrice: "14", priceDate: "2024-01-01", priceScope: null, regulated: true, verifiedAt: new Date() });
    await price({ designation: "Coffreur bancheur, taux horaire récent", kind: "main_oeuvre", unit: "h", unitPrice: "32", priceDate: "2026-08-01", priceScope: null });
    // Chiffrage automatique : ni prix historique, ni salaire minimal brut, base de calcul d'un déboursé.
    const auto = await findCandidates(db, { text: "coffreur bancheur", currency: "EUR", country: "FR", purpose: "sous_detail", staleMonths: 12 });
    expect(auto.map((c) => c.designation)).toEqual(["Coffreur bancheur, taux horaire récent"]);
    // Liste des prix historiques : le salaire minimal revérifié reste en vigueur.
    const historical = (await admin.request("/api/admin/library/prices?anciens=1&pays=FR&q=coffreur")).json.items as Array<{ designation: string }>;
    expect(historical.map((i) => i.designation)).toEqual(["Coffreur bancheur, taux horaire ancien"]);

    await price({ designation: "Chape fluide anhydrite posée", priceDate: "2018-05-01" });
    const manual = await findCandidates(db, { text: "chape fluide anhydrite", currency: "EUR", country: "FR", purpose: "ligne", staleMonths: 12 });
    expect(manual).toHaveLength(1);
    expect(manual[0]).toMatchObject({ designation: "Chape fluide anhydrite posée", historical: true });

    const today = new Date("2026-10-12T12:00:00Z");
    expect(isHistoricalPrice({ priceDate: "2025-01-01" }, 12, today)).toBe(true);
    expect(isHistoricalPrice({ priceDate: "2025-01-01", regulated: true, verifiedAt: "2026-10-01T00:00:00Z" }, 12, today)).toBe(false);
    expect(isHistoricalPrice({ priceDate: "2024-01-01", regulated: true, verifiedAt: "2025-06-01T00:00:00Z" }, 12, today)).toBe(true);
  });
});

describe("Filtre par lot", () => {
  it("rattache les prix d'un lot à sa famille et à ses sous-familles", async () => {
    await price({ designation: "Grès cérame 60 x 60 posé collé", tradeFamily: "second_oeuvre", subFamily: "Carrelage et faïence" });
    await price({ designation: "Peinture acrylique deux couches", tradeFamily: "second_oeuvre", subFamily: "Peinture et revêtements muraux" });
    await price({ designation: "Ciment CEM II en sac", kind: "materiau", priceScope: "fourniture", unit: "t", tradeFamily: "gros_oeuvre", subFamily: null });
    const carrelage = (await admin.request("/api/admin/library/prices?lot=17&pays=FR&pageSize=50")).json as { items: Array<{ designation: string }> };
    expect(carrelage.items.map((i) => i.designation)).toEqual(["Grès cérame 60 x 60 posé collé"]);
    const grosOeuvre = (await admin.request("/api/admin/library/prices?lot=01&pays=FR&pageSize=50")).json as { items: Array<{ designation: string }> };
    expect(grosOeuvre.items.map((i) => i.designation)).toContain("Ciment CEM II en sac");
    // Lot inconnu : filtre ignoré.
    expect((await admin.request("/api/admin/library/prices?lot=99&pays=FR&pageSize=50")).json.total).toBeGreaterThanOrEqual(3);
  });
});

describe("Sources chargées depuis leurs instantanés", () => {
  it("charge les salaires du BTP, les carburants et le SMIG avec leur provenance", async () => {
    for (const key of ["salaires-btp", "carburants-prix", "smig-maroc"]) {
      expect((await admin.request(`/api/admin/library/sources/${key}/load`, { method: "POST" })).status).toBe(202);
    }
    const sources = (await admin.request("/api/admin/library/sources")).json.items as Array<{ key: string; references: number; pending: number; snapshot: { references: number } | null }>;
    for (const key of ["salaires-btp", "carburants-prix", "smig-maroc"]) {
      const source = sources.find((s) => s.key === key)!;
      expect(source.snapshot!.references).toBeGreaterThan(0);
      expect(source.references + source.pending).toBe(source.snapshot!.references);
    }
    const smig = (await admin.request("/api/admin/library/prices?source=smig-maroc")).json.items as Array<{ unit: string; currency: string; kind: string; regulated: boolean; unitPrice: string }>;
    expect(smig).toHaveLength(1);
    expect(smig[0]).toMatchObject({ unit: "h", currency: "MAD", kind: "main_oeuvre", regulated: true });
    expect(Number(smig[0]!.unitPrice)).toBeGreaterThan(10);
    const labour = (await admin.request("/api/admin/library/prices?source=salaires-btp&nature=main_oeuvre&pageSize=5")).json as { total: number; items: Array<{ regulated: boolean; country: string }> };
    expect(labour.total).toBeGreaterThan(500);
    expect(labour.items.every((i) => i.regulated && i.country === "FR")).toBe(true);
  });
});

describe("Instantanés des prix appliqués", () => {
  it("une mise à jour de la bibliothèque ne modifie ni une ligne de DPGF ni un sous-détail déjà chiffrés", async () => {
    const project = await admin.request("/api/admin/projects", { body: { name: "Groupe scolaire", country: "FR", marketType: "consultation_privee", sector: "prive", currency: "EUR", city: "Rennes" } });
    const projectId = project.json.project.id as string;
    const [dpgf] = await db.insert(schema.dpgf).values({ projectId, title: "DPGF", currency: "EUR" }).returning();
    const [line] = await db.insert(schema.dpgfLine).values({ dpgfId: dpgf!.id, position: 1, kind: "poste", code: "1.1", designation: "Ragréage autolissant fibré", unit: "m2", quantity: "200" }).returning();

    const ragreage = await price({ designation: "Ragréage autolissant fibré posé", unitPrice: "18" });
    const applied = await admin.request(`/api/admin/dpgf/${dpgf!.id}/apply-prices`, { body: { assignments: [{ lineId: line!.id, priceItemId: ragreage.id }] } });
    expect(applied.json.applied).toBe(1);

    // Composant de main-d'œuvre chiffré avec un salaire minimal de la source publique.
    const snapshot = readSnapshot("salaires-btp")!;
    const key = snapshot.records.find((r) => r.externalKey.startsWith("kali:1597:salaire:bretagne::coef-210"))!.externalKey;
    const { row: source } = await sourceByKey(db, "salaires-btp");
    const [labour] = await db.select().from(schema.priceItem).where(eq(schema.priceItem.externalKey, key));
    const breakdown = (await admin.request(`/api/admin/dpgf/lines/${line!.id}/breakdown`, { method: "POST" })).json.breakdown as { id: string };
    const component = await admin.request(`/api/admin/breakdowns/${breakdown.id}/components`, { body: { category: "main_oeuvre", designation: "Compagnon", unit: "h", quantity: "0.2", priceItemId: labour!.id } });
    expect(component.status).toBe(201);
    const costBefore = component.json.component.unitCost as string;

    // La bibliothèque change : prix saisi modifié, nouvelle valeur publiée pour la référence publique.
    expect((await admin.request(`/api/admin/library/prices/${ragreage.id}`, { method: "PATCH", body: { unitPrice: "25" } })).status).toBe(200);
    const records = snapshot.records.map((r) => (r.externalKey === key ? { ...r, unitPrice: String(Number(r.unitPrice) + 1), priceDate: "2026-10-01", period: "1er octobre 2026" } : r));
    await stageBatch(db, { source, records, label: "Nouvelle lecture", trigger: "actualisation", resources: snapshot.resources });
    const [updatedLabour] = await db.select().from(schema.priceItem).where(eq(schema.priceItem.id, labour!.id));
    expect(Number(updatedLabour!.unitPrice)).toBe(Number(labour!.unitPrice) + 1);

    const [lineAfter] = await db.select().from(schema.dpgfLine).where(eq(schema.dpgfLine.id, line!.id));
    expect(Number(lineAfter!.unitPrice)).toBe(18);
    const [componentAfter] = await db.select().from(schema.priceBreakdownComponent).where(eq(schema.priceBreakdownComponent.id, component.json.component.id));
    expect(componentAfter!.unitCost).toBe(costBefore);
  });
});

describe("Premier chargement au déploiement", () => {
  it("charge une seule fois les sources jamais chargées et dresse le bilan réel de la base", async () => {
    const first = await initialLoad(db);
    // Les sources déjà chargées plus haut ne sont pas relues.
    expect(first.some((l) => l.includes("Salaires minimaux et indemnités"))).toBe(false);
    expect(first.some((l) => l.startsWith("✓ Prix et indices des matériaux de construction"))).toBe(true);
    const counts = await libraryCounts(db);
    const ma = counts.find((c) => c.country === "MA")!;
    const fr = counts.find((c) => c.country === "FR")!;
    expect(ma.published).toBeGreaterThan(7000);
    expect(ma.regulated).toBe(1);
    expect(fr.published).toBeGreaterThan(800);
    expect(fr.regulated).toBeGreaterThan(500);
    const second = await initialLoad(db);
    expect(second[0]).toBe("Bibliothèque de prix : toutes les sources sont déjà chargées.");
  }, 120_000);
});
