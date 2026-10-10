/**
 * Contrôles sur les fichiers d'exemple de l'affaire TAL-2026-0001 (documents privés, jamais versionnés) :
 * la suite s'exécute quand leurs chemins sont fournis, sinon elle est signalée comme ignorée.
 *
 *   TALAB_SAMPLE_PLAN="…/PLAN METRIKA.pdf" TALAB_SAMPLE_DPGF="…/DPGF.xlsx" npm test
 */
import { existsSync, readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { readPdfText } from "../../server/services/pdf-text.js";
import { numberTokens, resolveScale, scalesIn } from "../../server/services/plan-text.js";
import { adminSession, setupTestServer, type TestBrowser } from "../server/helpers.js";

const plan = process.env.TALAB_SAMPLE_PLAN;
const dpgf = process.env.TALAB_SAMPLE_DPGF;

describe.skipIf(!plan || !existsSync(plan))("plan d'exemple PLAN METRIKA : texte vectoriel et échelles", () => {
  it("lit le texte vectoriel des 12 planches et retient l'échelle écrite sur chacune", async () => {
    const pages = await readPdfText(new Uint8Array(readFileSync(plan!)));
    expect(pages).toHaveLength(12);
    // Planches issues de la CAO : chaque page porte son texte, cotes comprises.
    expect(pages.every((p) => p.items.length > 40)).toBe(true);
    expect(pages.filter((p) => numberTokens(p.items).size > 50).length).toBeGreaterThanOrEqual(9);
    const scales = pages.map((p) => scalesIn(p.items.map((i) => i.text).join("  ")));
    expect(scales).toEqual([[75], [50], [50], [50], [50], [50], [20], [20], [50], [50], [75], []]);
    expect(scales.map((s) => resolveScale(s, null).ratio)).toEqual([75, 50, 50, 50, 50, 50, 20, 20, 50, 50, 75, null]);
  });
});

describe.skipIf(!dpgf || !existsSync(dpgf))("DPGF d'exemple : import dans la bibliothèque", () => {
  let admin: TestBrowser;
  beforeAll(async () => {
    const ctx = await setupTestServer();
    admin = (await adminSession(ctx.app)).browser;
  });

  it("lit le classeur et refuse, motif à l'appui, chaque poste sans prix : aucun prix n'est inventé", async () => {
    const file = readFileSync(dpgf!).toString("base64");
    const preview = await admin.request("/api/admin/library/prices/import/preview", { body: { fileName: "DPGF.xlsx", contentBase64: file } });
    expect(preview.status).toBe(200);
    expect(preview.json.sheets).toEqual(["DPGF"]);
    const header = (preview.json.rows as string[][]).findIndex((r) => r[1] === "Désignation" && r[4] === "Prix unitaire");
    expect(header).toBeGreaterThan(0);
    const res = await admin.request("/api/admin/library/prices/import", {
      body: {
        fileName: "DPGF.xlsx",
        contentBase64: file,
        headerRow: header,
        columns: { designation: 1, unit: 2, unitPrice: 4, code: 0, kind: null, priceDate: null },
        defaults: { kind: "ouvrage", currency: "EUR", country: "FR", origin: "dpgf_historique", priceDate: "2026-10-10", tradeFamily: "gros_oeuvre", supplierId: null },
      },
    });
    expect(res.status).toBe(200);
    const priced = (preview.json.total as number) - header - 1 - res.json.rejectedCount;
    expect(res.json.imported).toBe(priced);
    expect((res.json.rejected as Array<{ reason: string }>).every((r) => ["prix illisible ou nul", "unité vide", "désignation vide"].includes(r.reason))).toBe(true);
  });
});
