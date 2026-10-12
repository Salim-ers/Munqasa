/**
 * Composition documentaire : documents courts et longs (CCTP de 40 à 100 pages, DPGF longue, sous-détails sur
 * plusieurs pages, descriptions longues, thème sombre) rendus puis relus sur les coordonnées réelles des
 * textes : aucune superposition, aucun dépassement de marge, aucune page presque vide, aucun titre seul en bas
 * de page, en-têtes et pieds paginés, couverture complète, contenu entier. Le contrôleur lui-même est éprouvé
 * sur un PDF volontairement défectueux.
 */
import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { documentIdentity } from "../../shared/settings.js";
import { breakdownsModel, breakdownsWorkbook, type BreakdownsData } from "../../server/documents/builders/breakdowns.js";
import { type DpgfData, dpgfModel, dpgfWorkbook } from "../../server/documents/builders/dpgf.js";
import { checkPdfLayout, checkXlsxStructure } from "../../server/documents/layout-check.js";
import type { Block, DocModel } from "../../server/documents/model.js";
import { nextLayout, renderDocxChecked, renderPdfChecked } from "../../server/documents/render-checked.js";
import { renderPdf } from "../../server/documents/render-pdf.js";
import { resultOf } from "../../server/services/breakdowns.js";
import { computeTotals, type LineRow, orderTree } from "../../server/services/dpgf.js";

const identity = documentIdentity.parse({});
const words = "réception des supports préparation coffrages armatures bétonnage cure contrôle tolérances protection nettoyage implantation réservations calepinage étaiement désétaiement interfaces".split(" ");
/** Texte déterministe d'une longueur donnée (aucun aléa : les tests sont reproductibles). */
function text(n: number, seed: number): string {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(words[(seed * 7 + i * 3) % words.length]!);
  const s = out.join(" ");
  return `${s.charAt(0).toUpperCase()}${s.slice(1)}.`;
}

function meta(title: string, extra: Partial<DocModel["meta"]> = {}): DocModel["meta"] {
  return {
    kind: "cctp",
    typeLabel: "Cahier des clauses techniques particulières",
    shortLabel: "CCTP",
    title,
    project: { reference: "TAL-2026-0099", name: "Résidence d’essai", location: "Rabat, Maroc", phase: "DCE (consultation des entreprises)" },
    client: "Maître d’ouvrage d’essai",
    lot: "Lot 01, Gros œuvre",
    version: 1,
    date: new Date(2026, 9, 12),
    status: "Généré avec réserves",
    company: "Talab Solutions",
    footerText: "Talab Solutions",
    orientation: "portrait",
    toc: true,
    disclaimer: null,
    ...extra,
  };
}

/** CCTP synthétique : chapitres sur nouvelle page, articles avec paragraphes, listes, exigences et notes. */
function cctp(chapters: number, articles: number, size: number): DocModel {
  const blocks: Block[] = [];
  for (let c = 1; c <= chapters; c++) {
    blocks.push({ type: "heading", level: 1, number: String(c), text: `${text(4, c)} et dispositions du chapitre`, pageBreakBefore: true });
    for (let a = 1; a <= articles; a++) {
      const seed = c * 100 + a;
      blocks.push({ type: "heading", level: 2, number: `${c}.${a}`, text: text(5 + (seed % 6), seed) });
      blocks.push({ type: "paragraph", content: [text(size + (seed % 30), seed)] });
      if (a % 2) blocks.push({ type: "list", ordered: "letters", items: [0, 1, 2].map((i) => [text(12 + i * 5, seed + i)]) });
      if (a % 3 === 0) blocks.push({ type: "requirement", content: [text(30, seed + 9)] });
      if (a % 4 === 0) blocks.push({ type: "note", content: [text(25, seed + 4)] });
      blocks.push({ type: "paragraph", content: [text(size / 2, seed + 1)] });
    }
  }
  return { meta: meta(`CCTP, lot 01 Gros œuvre, essai de ${chapters * articles} articles`), blocks };
}

const ctx = {
  project: { id: "p", reference: "TAL-2026-0099", name: "Résidence d’essai", city: "Rabat", country: "MA", designPhase: "dce" },
  client: null,
  lot: { id: "l", code: "01", name: "Gros œuvre" },
  company: null,
  identity,
} as unknown as DpgfData["ctx"];
const doc = { id: "d", projectId: "p", lotId: "l", cctpDocumentId: null, title: "DPGF, lot 01 Gros œuvre", currency: "MAD", vatRate: "20", status: "a_valider", currentVersion: 1, createdAt: new Date(), updatedAt: new Date() } as DpgfData["doc"];
const level = { level: "genere_avec_reserves" as const, label: "Généré avec réserves", reserves: [] };

/** DPGF synthétique : chapitres, sous-chapitres et postes à longues descriptions, une partie chiffrée. */
function dpgf(chapters: number, groups: number, postes: number): DpgfData {
  const lines: LineRow[] = [];
  let position = 0;
  const add = (fields: Partial<LineRow>) => {
    const row = { id: `L${position}`, dpgfId: "d", parentId: null, position, kind: "poste", code: null, lotNumber: null, cctpRef: null, cctpSectionId: null, workItemId: null, designation: "", description: null, unit: null, quantity: null, unitPrice: null, amount: null, measurementId: null, quantitySource: null, priceItemId: null, priceSource: null, status: "non_chiffre", createdAt: new Date(2026, 0, 1, 0, 0, position), updatedAt: new Date(), ...fields } as LineRow;
    position++;
    lines.push(row);
    return row;
  };
  for (let c = 1; c <= chapters; c++) {
    const chapter = add({ kind: "chapitre", designation: text(5, c) });
    for (let g = 1; g <= groups; g++) {
      const group = add({ kind: "sous_chapitre", parentId: chapter.id, designation: text(4, c * 10 + g) });
      for (let p = 1; p <= postes; p++) {
        const seed = c * 100 + g * 10 + p;
        const priced = seed % 3 !== 0;
        add({ parentId: group.id, designation: text(6 + (seed % 5), seed), description: text(20 + (seed % 40), seed + 2), unit: ["m3", "m2", "ml", "u", "kg"][seed % 5]!, quantity: String(10 + (seed % 90)), unitPrice: priced ? String(100 + seed) : null, amount: priced ? (((10 + (seed % 90)) * (100 + seed)).toFixed(2)) : null, quantitySource: "Métré : 1 mesure(s), dont 1 vérifiée(s)", cctpRef: `${c}.${g}` });
      }
    }
  }
  const postesRows = lines.filter((l) => l.kind === "poste");
  return {
    ctx,
    doc,
    ordered: orderTree(lines),
    totals: computeTotals(lines, "20"),
    coverage: { postes: postesRows.length, priced: postesRows.filter((l) => l.amount !== null).length, withoutQuantity: 0, withoutPrice: postesRows.filter((l) => l.unitPrice === null).length },
    version: null,
    level,
  };
}

/** Sous-détails synthétiques : de 3 à 8 composants, coûts connus ou non, décompositions impossibles. */
function sousDetails(count: number): BreakdownsData {
  const categories = ["materiau", "main_oeuvre", "materiel", "transport", "sous_traitance", "frais_chantier"] as const;
  const postes = Array.from({ length: count }, (_, i) => {
    const impossible = i % 9 === 4;
    const components = impossible
      ? []
      : Array.from({ length: 3 + (i % 6) }, (_, j) => ({
          id: `c${i}-${j}`,
          breakdownId: `b${i}`,
          position: j,
          category: categories[(i + j) % categories.length]!,
          designation: text(6 + ((i + j) % 6), i * 10 + j),
          unit: ["m3", "h", "j", "t", "u"][(i + j) % 5]!,
          quantity: String(1 + ((i + j) % 4) * 0.5),
          unitCost: (i + j) % 4 === 0 ? null : String(50 + i + j),
          lossRate: j === 0 ? "3" : null,
          lossMode: (i % 2 ? "incluse" : "appliquee") as "incluse" | "appliquee",
          details: {},
          isHypothesis: true,
          priceItemId: null,
          supplierId: null,
          sourceNote: text(15 + ((i * j) % 20), i + j),
          createdAt: new Date(),
          updatedAt: new Date(),
        }));
    const breakdown = { id: `b${i}`, projectId: "p", dpgfLineId: `l${i}`, workItemId: null, designation: text(8, i), unit: "m3", currency: "MAD", overheadRate: i % 2 ? "10" : null, overheadBase: "debourse_total", contingencyRate: null, contingencyBase: "debourse_total", marginRate: i % 3 ? "8" : null, marginMode: "taux_de_marge", computedUnitPrice: null, locked: false, status: "brouillon", currentVersion: 0, notes: impossible ? "Matériau et section non définis par les pièces." : null, decomposition: impossible ? "impossible" : "decomposee", missingCharacteristics: impossible ? ["matériau", "section"] : [], createdAt: new Date(), updatedAt: new Date() } as BreakdownsData["postes"][number]["breakdown"];
    return { code: `${1 + Math.floor(i / 10)}.${(i % 10) + 1}`, designation: text(8 + (i % 7), i), unit: "m3", breakdown, components, result: resultOf(breakdown, components) };
  });
  return { ctx, doc, postes, withoutBreakdown: 0, level } as BreakdownsData;
}

const describeIssues = (r: { issues: Array<{ kind: string; page: number | null; detail: string }> }) => r.issues.map((i) => `${i.kind} p.${i.page}: ${i.detail}`);

describe("composition et contrôle du rendu", () => {
  it("CCTP court : couverture, sommaire, en-têtes et pieds, aucune anomalie", async () => {
    const model = cctp(3, 2, 60);
    const { buffer, layout } = await renderPdfChecked(model, identity, { theme: "clair" });
    expect(describeIssues(layout)).toEqual([]);
    expect(layout.pages).toBeGreaterThanOrEqual(3);
    const docx = await renderDocxChecked(model, identity, { theme: "clair" });
    expect(describeIssues(docx.layout)).toEqual([]);
    expect(Buffer.from(buffer.subarray(0, 5)).toString()).toBe("%PDF-");
  });

  it("CCTP de 40 à 100 pages : titres jamais isolés, sommaire sans page résiduelle, chaque page paginée", async () => {
    const model = cctp(10, 9, 120);
    const { layout } = await renderPdfChecked(model, identity, { theme: "clair" });
    expect(describeIssues(layout)).toEqual([]);
    expect(layout.pages).toBeGreaterThanOrEqual(40);
    expect(layout.pages).toBeLessThanOrEqual(100);
  }, 120_000);

  it("DPGF longue : colonnes dans la page, lignes jamais coupées, totaux et sous-totaux imprimés", async () => {
    const data = dpgf(8, 3, 12);
    const model = dpgfModel(data);
    const { layout } = await renderPdfChecked(model, identity, { theme: "clair" });
    expect(describeIssues(layout)).toEqual([]);
    expect(layout.pages).toBeGreaterThan(20);
    expect(describeIssues(await checkXlsxStructure(await dpgfWorkbook(data, "clair")))).toEqual([]);
  }, 120_000);

  it("sous-détails sur plusieurs pages, en paysage : décompositions impossibles comprises, aucune anomalie", async () => {
    const data = sousDetails(45);
    const model = breakdownsModel(data);
    expect(model.meta.orientation).toBe("landscape");
    const { layout } = await renderPdfChecked(model, identity, { theme: "clair" });
    expect(describeIssues(layout)).toEqual([]);
    expect(layout.pages).toBeGreaterThan(15);
    expect(describeIssues(await checkXlsxStructure(await breakdownsWorkbook(data, "clair")))).toEqual([]);
  }, 120_000);

  it("thème sombre et titre très long : couverture sans superposition, corps du titre adapté", async () => {
    const model = cctp(2, 2, 40);
    model.meta.title = `CCTP, lot 01 Gros œuvre, ${text(28, 3)}`;
    model.meta.disclaimer = text(40, 5);
    const { layout } = await renderPdfChecked(model, identity, { theme: "sombre" });
    expect(describeIssues(layout)).toEqual([]);
  });

  it("tableau à colonnes nombreuses et mots longs : aucun dépassement de marge", async () => {
    const model: DocModel = {
      meta: meta("Tableau large", { toc: false }),
      blocks: [
        {
          type: "table",
          columns: [
            { label: "Désignation", width: 30 },
            { label: "Consommation", width: 10, align: "right" },
            { label: "Coût unitaire", width: 10, align: "right" },
            { label: "Pertes", width: 10, align: "right" },
            { label: "Quantité brute", width: 10, align: "right" },
            { label: "Montant pour 1 unité", width: 15, align: "right" },
            { label: "Source", width: 15 },
          ],
          rows: Array.from({ length: 30 }, (_, i) => ({ cells: [text(10, i), "1,030", "809,27 MAD", "3 %", "1,030", "833,55 MAD", `Bordereau-prix-référence-${i}-réseaux`] })),
        },
      ],
    };
    const { layout } = await renderPdfChecked(model, identity, { theme: "clair" });
    expect(describeIssues(layout)).toEqual([]);
  });
});

describe("contrôleur du rendu", () => {
  it("détecte dépassement de marge, superposition, page presque vide, pied absent et contenu manquant", async () => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const cover = pdf.addPage([595.28, 841.89]);
    cover.drawText("Titre de controle", { x: 70, y: 400, size: 20, font });
    const page = pdf.addPage([595.28, 841.89]);
    page.drawText("Texte hors marge", { x: 5, y: 600, size: 10, font });
    page.drawText("Premier texte superpose", { x: 100, y: 500, size: 10, font });
    page.drawText("Second texte superpose", { x: 102, y: 501, size: 10, font });
    // Page suivante bien remplie : la page précédente, presque vide, n'est pas la dernière.
    const full = pdf.addPage([595.28, 841.89]);
    for (let i = 0; i < 30; i++) full.drawText("Une ligne de texte courante dans le corps de la page", { x: 70, y: 700 - i * 18, size: 10, font });
    const bytes = await pdf.save();
    const model: DocModel = { meta: meta("Titre de controle", { toc: false }), blocks: [{ type: "paragraph", content: ["Paragraphe qui manque au rendu"] }] };
    const report = await checkPdfLayout(bytes, model);
    const kinds = new Set(report.issues.map((i) => i.kind));
    for (const kind of ["marge", "chevauchement", "page_presque_vide", "en_tete", "pied_de_page", "contenu_manquant"]) expect(kinds, kind).toContain(kind);
  });

  it("recompose avec un saut forcé avant le titre signalé seul en bas de page, puis s'arrête", () => {
    const model = cctp(1, 3, 30);
    const report = { format: "pdf" as const, pages: 5, tocPages: [2], issues: [{ kind: "titre_isole" as const, page: 3, detail: "", heading: `1.2 ${(model.blocks[5] as { text: string }).text}` }] };
    const headingIndex = model.blocks.findIndex((b) => b.type === "heading" && b.number === "1.2");
    expect(nextLayout(model, {}, report)).toEqual({ forcedBreaks: [headingIndex] });
    expect(nextLayout(model, { forcedBreaks: [headingIndex] }, report)).toBeNull();
    expect(nextLayout(model, {}, { ...report, issues: [{ kind: "page_presque_vide", page: 2, detail: "" }] })).toEqual({ forcedBreaks: [], compactToc: true });
  });

  it("un rendu sans contrôle reste possible et identique en contenu", async () => {
    const model = cctp(1, 2, 20);
    const pdf = await renderPdf(model, identity, { theme: "clair" });
    expect((await checkPdfLayout(pdf, model)).issues.filter((i) => i.kind === "contenu_manquant")).toEqual([]);
  });
});
