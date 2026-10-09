/** Export Excel des sous-détails d'une DPGF : un bloc par poste, composants, déboursés, frais et prix de vente. */
import ExcelJS from "exceljs";
import { COMPONENT_CATEGORY_LABELS, type MarginMode, RATE_BASE_LABELS } from "../../shared/enums.js";
import type { DocumentIdentity } from "../../shared/settings.js";
import type { BreakdownRow, ComponentRow } from "../services/breakdowns.js";
import type { BreakdownResult } from "../services/pricing.js";

export interface BreakdownExportData {
  title: string;
  currency: string;
  project: { reference: string; name: string };
  identity: DocumentIdentity;
  postes: Array<{ code: string | null; designation: string; unit: string | null; breakdown: BreakdownRow; components: ComponentRow[]; result: BreakdownResult | { error: string } }>;
}

function marginLabel(mode: MarginMode, rate: string | null): string {
  if (!rate) return "taux non saisi";
  if (mode === "coefficient") return `coefficient ${Number(rate)}`;
  return `${mode === "taux_de_marque" ? "taux de marque" : "taux de marge"} de ${Number(rate)} %`;
}

export async function breakdownsToXlsx(data: BreakdownExportData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sous-détails", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    headerFooter: { oddFooter: `&L${data.identity.footerText}&C${data.title}&RPage &P sur &N` },
  });
  const primary = `FF${data.identity.primaryColor.replace("#", "").toUpperCase()}`;
  const money = `#,##0.00 "${data.currency}"`;
  sheet.columns = [{ width: 18 }, { width: 50 }, { width: 9 }, { width: 13 }, { width: 16 }, { width: 10 }, { width: 18 }, { width: 50 }];
  sheet.mergeCells("A1:H1");
  sheet.getCell("A1").value = `Sous-détails de prix, ${data.title}`;
  sheet.getCell("A1").font = { size: 15, bold: true, color: { argb: primary } };
  sheet.mergeCells("A2:H2");
  sheet.getCell("A2").value = `${data.project.reference}, ${data.project.name}. Les consommations marquées comme hypothèses sont à confirmer.`;
  sheet.getCell("A2").font = { color: { argb: "FF7A7A7A" } };

  let r = 4;
  for (const poste of data.postes) {
    sheet.mergeCells(`A${r}:H${r}`);
    sheet.getCell(`A${r}`).value = `${[poste.code, poste.designation].filter(Boolean).join(" ")}, prix pour 1 ${poste.unit ?? "u"}`;
    sheet.getCell(`A${r}`).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getCell(`A${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: primary } };
    r++;
    sheet.getRow(r).values = ["Catégorie", "Composant", "Unité", "Consommation", "Coût unitaire", "Pertes", "Coût pour 1 unité", "Source"];
    sheet.getRow(r).font = { bold: true };
    r++;
    const totals = "error" in poste.result ? [] : poste.result.componentTotals;
    poste.components.forEach((c, i) => {
      const row = sheet.getRow(r++);
      row.values = [
        COMPONENT_CATEGORY_LABELS[c.category],
        c.designation,
        c.unit,
        Number(c.quantity),
        c.unitCost !== null ? Number(c.unitCost) : "à chiffrer",
        c.lossRate !== null ? `${Number(c.lossRate)} %` : "",
        totals[i] !== null && totals[i] !== undefined ? Number(totals[i]) : "",
        [c.isHypothesis ? "Hypothèse" : null, c.sourceNote].filter(Boolean).join(". "),
      ];
      row.getCell(4).numFmt = "#,##0.000###";
      row.getCell(5).numFmt = money;
      row.getCell(7).numFmt = money;
      row.getCell(8).alignment = { wrapText: true };
    });
    if ("error" in poste.result) {
      sheet.getCell(`B${r++}`).value = poste.result.error;
    } else {
      const b = poste.breakdown;
      const res = poste.result;
      const lines: Array<[string, string | null]> = [
        ["Déboursé sec", res.debourseSec],
        ["Frais de chantier", res.fraisChantier],
        ["Déboursé total", res.debourseTotal],
        [`Frais généraux, ${b.overheadRate ? `${Number(b.overheadRate)} % du ${RATE_BASE_LABELS[b.overheadBase].toLowerCase()}` : "taux non saisi"}`, res.overhead],
        [`Aléas, ${b.contingencyRate ? `${Number(b.contingencyRate)} % du ${RATE_BASE_LABELS[b.contingencyBase].toLowerCase()}` : "taux non saisi"}`, res.contingency],
        ["Prix de revient", res.prixDeRevient],
        [`Marge, ${marginLabel(b.marginMode, b.marginRate)}`, res.margin],
        ["Prix de vente unitaire", res.prixDeVente],
      ];
      for (const [label, value] of lines) {
        sheet.mergeCells(`A${r}:F${r}`);
        sheet.getCell(`A${r}`).value = label;
        sheet.getCell(`A${r}`).alignment = { horizontal: "right" };
        sheet.getCell(`G${r}`).value = value !== null ? Number(value) : "incomplet";
        sheet.getCell(`G${r}`).numFmt = money;
        if (label === "Prix de vente unitaire") {
          sheet.getCell(`A${r}`).font = { bold: true };
          sheet.getCell(`G${r}`).font = { bold: true, color: { argb: primary } };
        }
        r++;
      }
    }
    r++;
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
