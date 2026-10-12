/**
 * Dossier réel de l'affaire TAL-2026-0003 (document privé, jamais versionné) : le CCTP, la DPGF et les
 * sous-détails qu'il contient sont relus, recomposés par le moteur actuel et contrôlés page par page.
 * La suite s'exécute quand le chemin du ZIP est fourni :
 *
 *   TALAB_SAMPLE_DOSSIER="…/TAL-2026-0003 Dossier complet.zip" npm test
 */
import { existsSync, readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { beforeAll, describe, expect, it } from "vitest";
import { documentIdentity } from "../../shared/settings.js";
import { breakdownsModel, breakdownsWorkbook, type BreakdownsData } from "../../server/documents/builders/breakdowns.js";
import { type DpgfData, dpgfModel, dpgfWorkbook } from "../../server/documents/builders/dpgf.js";
import { checkXlsxStructure } from "../../server/documents/layout-check.js";
import type { Block, DocModel } from "../../server/documents/model.js";
import { renderDocxChecked, renderPdfChecked } from "../../server/documents/render-checked.js";
import { resultOf } from "../../server/services/breakdowns.js";
import { computeTotals, type LineRow, orderTree } from "../../server/services/dpgf.js";
import { lossesAlreadyIncluded } from "../../server/services/pricing.js";

const zipPath = process.env.TALAB_SAMPLE_DOSSIER;
const identity = documentIdentity.parse({});
const CATEGORIES: Record<string, string> = { Matériaux: "materiau", "Main-d’œuvre": "main_oeuvre", Matériel: "materiel", "Sous-traitance": "sous_traitance", Transport: "transport", "Frais de chantier": "frais_chantier" };
const RESULTS = /^(Déboursé|Frais de chantier|Frais généraux|Aléas|Prix de revient|Marge|Prix de vente|Statut du coût)/;

async function sheet(zip: JSZip, pattern: RegExp, name?: string): Promise<ExcelJS.Worksheet> {
  const file = Object.keys(zip.files).find((f) => pattern.test(f))!;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await zip.file(file)!.async("nodebuffer")) as unknown as ArrayBuffer);
  return name ? wb.getWorksheet(name)! : wb.worksheets[0]!;
}
const value = (v: ExcelJS.CellValue): unknown => (v && typeof v === "object" && "result" in v ? (v as { result: unknown }).result : v);

describe.skipIf(!zipPath || !existsSync(zipPath))("dossier réel TAL-2026-0003 : recomposition et contrôle de mise en page", () => {
  let zip: JSZip;
  const ctx = {
    project: { id: "p", reference: "TAL-2026-0003", name: "TEST", city: null, country: "MA", designPhase: "dce" },
    client: null,
    lot: { id: "l", code: "01", name: "Gros œuvre" },
    company: null,
    identity,
  } as unknown as DpgfData["ctx"];
  const doc = { id: "d", projectId: "p", lotId: "l", cctpDocumentId: null, title: "DPGF, lot 01 Gros œuvre — Affaire TEST — TAL-2026-0003", currency: "MAD", vatRate: "20", status: "a_valider", currentVersion: 2, createdAt: new Date(), updatedAt: new Date() } as DpgfData["doc"];
  const level = { level: "genere_avec_reserves" as const, label: "Généré avec réserves", reserves: [] };

  beforeAll(async () => {
    zip = await JSZip.loadAsync(readFileSync(zipPath!));
  });

  it("sous-détails : 65 postes, pertes jamais comptées deux fois, décompositions impossibles dites, aucune anomalie", async () => {
    const ws = await sheet(zip, /06 Sous-détails\/.*\.xlsx$/);
    const postes: BreakdownsData["postes"] = [];
    let current: { code: string; designation: string; unit: string; components: BreakdownsData["postes"][number]["components"] } | null = null;
    ws.eachRow((row) => {
      const cells = (row.values as ExcelJS.CellValue[]).slice(1).map(value);
      const first = typeof cells[0] === "string" ? (cells[0] as string) : null;
      const heading = first ? /^(\d+(?:\.\d+)+) (.*), prix pour 1 (.*)$/.exec(first) : null;
      if (heading) {
        current = { code: heading[1]!, designation: heading[2]!, unit: heading[3]!, components: [] };
        postes.push(current as never);
        return;
      }
      if (!current || !first || RESULTS.test(first) || first === "Catégorie" || !cells[1] || !CATEGORIES[first]) return;
      const quantity = String(cells[3]);
      const lossRate = typeof cells[5] === "number" ? String(Math.round(cells[5] * 10000) / 100) : null;
      const source = String(cells[7] ?? "");
      current.components.push({
        id: `c${postes.length}-${current.components.length}`,
        breakdownId: `b${postes.length}`,
        position: current.components.length,
        category: CATEGORIES[first] as never,
        designation: String(cells[1]),
        unit: String(cells[2] ?? "u"),
        quantity,
        unitCost: typeof cells[4] === "number" ? String(cells[4]) : null,
        lossRate,
        lossMode: lossesAlreadyIncluded(quantity, lossRate, source) ? "incluse" : "appliquee",
        details: {},
        isHypothesis: true,
        priceItemId: null,
        supplierId: null,
        sourceNote: source,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });
    const data = {
      ctx,
      doc,
      level,
      withoutBreakdown: 0,
      postes: (postes as unknown as Array<{ code: string; designation: string; unit: string; components: BreakdownsData["postes"][number]["components"] }>).map((p, i) => {
        const breakdown = { id: `b${i}`, projectId: "p", dpgfLineId: `l${i}`, workItemId: null, designation: p.designation, unit: p.unit, currency: "MAD", overheadRate: null, overheadBase: "debourse_total", contingencyRate: null, contingencyBase: "debourse_total", marginRate: null, marginMode: "taux_de_marge", computedUnitPrice: null, locked: false, status: "brouillon", currentVersion: 0, notes: null, decomposition: p.components.length ? "decomposee" : "impossible", missingCharacteristics: [], createdAt: new Date(), updatedAt: new Date() } as BreakdownsData["postes"][number]["breakdown"];
        return { code: p.code, designation: p.designation, unit: p.unit, breakdown, components: p.components, result: resultOf(breakdown, p.components) };
      }),
    } as BreakdownsData;
    expect(data.postes).toHaveLength(65);
    // Béton des bandeaux de loggias : 1,03 m³ comprenant 3 % de pertes, au prix de 809,2673 : 833,5453.
    const bandeau = data.postes.find((p) => p.code === "3.2.1")!;
    const beton = bandeau.components.findIndex((c) => /Béton/.test(c.designation));
    expect(bandeau.components[beton]!.lossMode).toBe("incluse");
    expect("error" in bandeau.result ? null : bandeau.result.figures[beton]!.amount).toBe("833.5453");
    expect(data.postes.filter((p) => p.components.length === 0).map((p) => p.code)).toEqual(["3.3.1", "4.1.1", "4.1.2", "4.2.1", "5.2.3", "5.3.1", "5.3.2", "5.4.1"]);
    const model = breakdownsModel(data);
    const { layout } = await renderPdfChecked(model, identity, { theme: "clair" });
    expect(layout.issues).toEqual([]);
    expect((await checkXlsxStructure(await breakdownsWorkbook(data, "clair"))).issues).toEqual([]);
  }, 180_000);

  it("DPGF : 65 postes, totaux non chiffrés dits tels quels, aucune anomalie", async () => {
    const ws = await sheet(zip, /02 DPGF\/.*\.xlsx$/, "DPGF");
    const lines: LineRow[] = [];
    const ids = new Map<string, string>();
    let started = false;
    let stop = false;
    ws.eachRow((row) => {
      if (stop) return;
      const cells = (row.values as ExcelJS.CellValue[]).slice(1).map(value);
      if (cells[0] === "N°") {
        started = true;
        return;
      }
      if (!started || cells[0] === null || cells[0] === undefined) return;
      const code = String(cells[0]);
      if (/^(Total|Taxe)/.test(code)) {
        stop = true;
        return;
      }
      const parts = code.split(".");
      const id = `L${lines.length}`;
      ids.set(code, id);
      const [designation, ...rest] = String(cells[1]).split("\n");
      lines.push({ id, dpgfId: "d", parentId: parts.length > 1 ? (ids.get(parts.slice(0, -1).join(".")) ?? null) : null, position: lines.length, kind: cells[2] ? "poste" : parts.length === 1 ? "chapitre" : "sous_chapitre", code, lotNumber: null, cctpRef: cells[6] ? String(cells[6]) : null, cctpSectionId: null, workItemId: null, designation: designation!, description: rest.join("\n") || null, unit: cells[2] ? String(cells[2]) : null, quantity: typeof cells[3] === "number" ? String(cells[3]) : null, unitPrice: null, amount: null, measurementId: null, quantitySource: cells[7] ? String(cells[7]) : null, priceItemId: null, priceSource: null, status: "non_chiffre", createdAt: new Date(2026, 0, 1, 0, 0, lines.length), updatedAt: new Date() } as LineRow);
    });
    const postes = lines.filter((l) => l.kind === "poste");
    expect(postes).toHaveLength(65);
    const data: DpgfData = { ctx, doc, level, version: null, ordered: orderTree(lines), totals: computeTotals(lines, "20"), coverage: { postes: postes.length, priced: 0, withoutQuantity: postes.filter((l) => l.quantity === null).length, withoutPrice: postes.length } };
    expect(data.totals.state).toBe("non_renseigne");
    const model = dpgfModel(data);
    const { layout } = await renderPdfChecked(model, identity, { theme: "clair" });
    expect(layout.issues).toEqual([]);
    expect((await checkXlsxStructure(await dpgfWorkbook(data, "clair"))).issues).toEqual([]);
  }, 180_000);

  it("CCTP : sommaire sans page résiduelle, aucun titre isolé, Word bien structuré", async () => {
    const file = Object.keys(zip.files).find((f) => /01 CCTP\/.*\.docx$/.test(f))!;
    const xml = await (await JSZip.loadAsync(await zip.file(file)!.async("nodebuffer"))).file("word/document.xml")!.async("string");
    const blocks: Block[] = [];
    let list: string[] = [];
    const flush = () => {
      if (list.length) blocks.push({ type: "list", ordered: "letters", items: list.map((t) => [t]) });
      list = [];
    };
    const decode = (t: string) => t.replace(/&apos;/g, "’").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
    for (const p of xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []) {
      const content = decode([...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join("")).trim();
      if (!content) continue;
      const style = /<w:pStyle w:val="([^"]+)"/.exec(p)?.[1] ?? "";
      const isList = p.includes("<w:numPr>");
      if (!isList) flush();
      if (/^Heading[123]$/.test(style)) {
        const m = /^([\d.]+) (.*)$/.exec(content);
        blocks.push({ type: "heading", level: style === "Heading1" ? 1 : 2, number: m ? m[1]! : null, text: m ? m[2]! : content, pageBreakBefore: style === "Heading1" });
      } else if (isList) list.push(content);
      else if (p.includes("<w:pBdr>") && p.includes("<w:shd")) blocks.push(content.startsWith("Note : ") ? { type: "note", content: [content.slice(7)] } : { type: "requirement", content: [content] });
      else blocks.push({ type: "paragraph", content: [content] });
    }
    flush();
    const body = blocks.slice(blocks.findIndex((b) => b.type === "heading" && b.level === 1));
    expect(body.filter((b) => b.type === "heading").length).toBeGreaterThan(50);
    const model: DocModel = {
      meta: { kind: "cctp", typeLabel: "Cahier des clauses techniques particulières", shortLabel: "CCTP", title: "CCTP, lot 01 Gros œuvre — Affaire TEST — TAL-2026-0003", project: { reference: "TAL-2026-0003", name: "TEST", location: "Maroc", phase: "DCE (consultation des entreprises)" }, client: null, lot: "Lot 01, Gros œuvre", version: 2, date: new Date(2026, 9, 11), status: "Généré avec réserves", company: null, footerText: "Talab Solutions", orientation: "portrait", toc: true, disclaimer: null },
      blocks: body,
    };
    const { layout } = await renderPdfChecked(model, identity, { theme: "clair" });
    expect(layout.issues).toEqual([]);
    expect((await renderDocxChecked(model, identity, { theme: "clair" })).layout.issues).toEqual([]);
  }, 180_000);
});
