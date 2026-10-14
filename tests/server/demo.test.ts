/**
 * Démonstration et catalogue vérifié du référentiel : références vérifiées à la source avec leur lien,
 * ancien catalogue complété sans jamais toucher une saisie, prix publics de 2022 admis dans les chiffrages
 * automatiques seulement sur accord explicite, une affaire par pays avec ses lots, jamais recréée en double.
 */
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { schema } from "../../server/db/index.js";
import { DEMO_LOTS, DEMO_PRICE_MONTHS } from "../../server/services/demo.js";
import { findCandidates } from "../../server/services/pricing.js";
import { CATALOG_VERIFIED_ON, LEGACY_NOTE, STARTER_CATALOG } from "../../server/services/references-catalog.js";
import { adminSession, setupTestServer, type TestBrowser } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof setupTestServer>>;
let admin: TestBrowser;

/** Date située `n` mois avant aujourd'hui (les prix publics de 2022 ont environ 51 mois en octobre 2026). */
function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

const status = async () => (await admin.request("/api/admin/demonstration")).json.status;

beforeAll(async () => {
  ctx = await setupTestServer();
  admin = (await adminSession(ctx.app)).browser;
});

describe("catalogue vérifié du référentiel", () => {
  it("ne contient que des références sourcées, sans doublon", () => {
    const keys = STARTER_CATALOG.map((r) => `${r.scope}:${r.code.replace(/\s+/g, "").toUpperCase()}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const r of STARTER_CATALOG) {
      expect(r.sourceUrl).toMatch(/^https:\/\//);
      expect(r.title.length).toBeGreaterThan(5);
      expect(r.checked.length).toBeGreaterThan(10);
      expect(r.title).not.toMatch(/—/);
    }
    expect(STARTER_CATALOG.filter((r) => r.scope === "FR").length).toBeGreaterThan(20);
    expect(STARTER_CATALOG.filter((r) => r.scope === "MA").length).toBeGreaterThan(10);
  });

  it("complète l'ancien catalogue resté tel quel, rejette ce qui n'est plus en vigueur, ne touche jamais une saisie", async () => {
    const r = schema.technicalReference;
    await ctx.db.insert(r).values([
      { scope: "FR", kind: "norme", code: "NF EN 206/CN", title: "Béton : spécification", notes: LEGACY_NOTE },
      { scope: "FR", kind: "dtu", code: "NF DTU 13.11", title: "Fondations superficielles", notes: LEGACY_NOTE },
      { scope: "FR", kind: "norme", code: "NF A 35-080-1", title: "Aciers pour béton armé", notes: LEGACY_NOTE },
      // Saisie de l'utilisateur, ou ancienne entrée qu'il a vérifiée : jamais modifiées.
      { scope: "FR", kind: "dtu", code: "NF DTU 21", title: "Mon intitulé", version: "2004", notes: "Saisie interne" },
      { scope: "MA", kind: "reglement", code: "RPS 2000", title: "Règlement de construction parasismique", notes: LEGACY_NOTE, verificationStatus: "verifie" },
    ]);
    const res = await admin.request("/api/admin/references/catalogue", { body: {} });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ updated: 2, withdrawn: 1, skipped: 2, imported: STARTER_CATALOG.length - 4 });

    const rows = await ctx.db.select().from(r);
    const byCode = (code: string) => rows.filter((row) => row.code === code);
    expect(byCode("NF EN 206/CN")).toHaveLength(0);
    expect(byCode("NF EN 206+A2/CN")[0]).toMatchObject({ verificationStatus: "verifie", version: "décembre 2025", title: "Béton - Spécification, performance, production et conformité - Complément national à la norme NF EN 206+A2" });
    expect(byCode("NF EN 206+A2/CN")[0]!.sourceUrl).toContain("boutique.afnor.org");
    expect(byCode("NF EN 206+A2/CN")[0]!.notes).toBe("Vérifié le 14 octobre 2026 sur la boutique AFNOR : norme en vigueur, publiée en décembre 2025. À revoir si une nouvelle édition paraît.");
    expect(byCode("NF EN 206+A2/CN")[0]!.verifiedAt!.toISOString().slice(0, 10)).toBe(CATALOG_VERIFIED_ON);
    expect(byCode("NF A35-080-1")[0]).toMatchObject({ verificationStatus: "verifie", version: "mai 2020" });
    expect(byCode("NF DTU 13.11")[0]).toMatchObject({ verificationStatus: "rejete" });
    expect(byCode("NF DTU 13.11")[0]!.notes).toContain("remplacé par le NF DTU 13.1");
    expect(byCode("NF DTU 13.1")[0]).toMatchObject({ verificationStatus: "verifie", version: "septembre 2019" });
    expect(byCode("NF DTU 21")).toEqual([expect.objectContaining({ title: "Mon intitulé", version: "2004", notes: "Saisie interne" })]);
    expect(byCode("RPS 2000")).toEqual([expect.objectContaining({ notes: LEGACY_NOTE })]);
    expect(byCode("NM 01.4.097")[0]).toMatchObject({ scope: "MA", verificationStatus: "verifie" });
    expect(byCode("NM 01.4.097")[0]!.notes).toContain("RCNM004");

    // Relancé : rien ne change.
    expect((await admin.request("/api/admin/references/catalogue", { body: {} })).json).toMatchObject({ imported: 0, updated: 0, withdrawn: 0 });
  });
});

describe("démonstration", () => {
  let first: { MA: string; FR: string };

  it("dit ce qui manque avant toute préparation", async () => {
    await ctx.db.insert(schema.priceItem).values([
      { designation: "Ciment CPJ 45", kind: "materiau", priceScope: "fourniture", unit: "t", unitPrice: "1717.3052", currency: "MAD", country: "MA", city: "Casablanca", origin: "donnees_publiques", taxBasis: "TTC", vatRate: "20", priceDate: monthsAgo(51), period: "2022" },
      { designation: "Ciment CPJ 45, ancien relevé", kind: "materiau", priceScope: "fourniture", unit: "t", unitPrice: "1515.3061", currency: "MAD", country: "MA", city: "Casablanca", origin: "donnees_publiques", taxBasis: "TTC", vatRate: "20", priceDate: monthsAgo(87), period: "2019" },
      { designation: "Salaire minimum légal", kind: "main_oeuvre", unit: "h", unitPrice: "17.92", currency: "MAD", country: "MA", origin: "donnees_publiques", priceDate: monthsAgo(2), regulated: true },
    ]);
    const s = await status();
    expect(s.references).toMatchObject({ catalog: STARTER_CATALOG.length, verified: STARTER_CATALOG.length - 1 });
    expect(s.prices).toEqual({ months: 12, target: DEMO_PRICE_MONTHS, usable: { MA: 0, FR: 0 }, usableAtTarget: { MA: 1, FR: 0 } });
    expect(s.projects.map((p: { id: string | null }) => p.id)).toEqual([null, null]);
  });

  it("crée une affaire par pays avec ses lots, sans admettre les prix de 2022 sans accord", async () => {
    expect((await admin.request("/api/admin/demonstration", { body: {} })).status).toBe(400);
    const res = await admin.request("/api/admin/demonstration", { body: { prices: false } });
    expect(res.status).toBe(200);
    expect(res.json.result.prices).toBeNull();
    expect(res.json.result.projects.map((p: { country: string; created: boolean }) => [p.country, p.created])).toEqual([["MA", true], ["FR", true]]);
    first = Object.fromEntries(res.json.result.projects.map((p: { country: string; id: string }) => [p.country, p.id])) as { MA: string; FR: string };

    const [ma] = await ctx.db.select().from(schema.project).where(eq(schema.project.id, first.MA));
    expect(ma).toMatchObject({ country: "MA", city: "Casablanca", currency: "MAD", name: "Démonstration : immeuble d’habitation R+3 à Casablanca" });
    expect(ma!.reference).toMatch(/^TAL-\d{4}-\d{4}$/);
    const lots = await ctx.db.select().from(schema.projectLot).where(eq(schema.projectLot.projectId, first.MA));
    expect(lots.map((l) => l.code).sort()).toEqual(DEMO_LOTS);
    expect(lots.find((l) => l.code === "01")!.name).toBe("Gros œuvre");
    expect(lots.every((l) => l.catalogEntryId)).toBe(true);
    // Rien n'est chiffré ni métré à la place de l'utilisateur.
    expect(await ctx.db.select().from(schema.workItem).where(eq(schema.workItem.projectId, first.MA))).toHaveLength(0);

    const s = res.json.status;
    expect(s.prices.months).toBe(12);
    expect(s.references.verified).toBe(STARTER_CATALOG.length - 1);
    expect(s.projects.find((p: { country: string }) => p.country === "FR")).toMatchObject({ id: first.FR, lots: DEMO_LOTS.length });
    expect(await findCandidates(ctx.db, { text: "ciment CPJ 45", currency: "MAD", country: "MA", city: "Casablanca", purpose: "sous_detail", staleMonths: s.prices.months })).toHaveLength(0);
  });

  it("admet les prix de 2022 sur accord, sans recréer les affaires ni baisser un seuil plus large", async () => {
    const res = await admin.request("/api/admin/demonstration", { body: { prices: true } });
    expect(res.json.result.prices).toEqual({ from: 12, to: DEMO_PRICE_MONTHS });
    expect(res.json.result.projects.map((p: { id: string; created: boolean }) => [p.id, p.created])).toEqual([
      [first.MA, false],
      [first.FR, false],
    ]);
    expect(res.json.status.prices).toMatchObject({ months: DEMO_PRICE_MONTHS, usable: { MA: 1, FR: 0 } });
    expect((await admin.request("/api/admin/settings/alertes")).json.value.stalePriceMonths).toBe(DEMO_PRICE_MONTHS);

    // Chiffrage automatique : le prix de 2022 sert, ramené hors taxes, avec sa mention « valeur 2022 » ; 2019 reste historique.
    const found = await findCandidates(ctx.db, { text: "ciment CPJ 45", currency: "MAD", country: "MA", city: "Casablanca", purpose: "sous_detail", staleMonths: DEMO_PRICE_MONTHS });
    expect(found.map((c) => c.designation)).toEqual(["Ciment CPJ 45"]);
    expect(found[0]).toMatchObject({ period: "2022", unitPriceHt: "1431.0877" });

    await admin.request("/api/admin/settings/alertes", { method: "PUT", body: { stalePriceMonths: 72, deadlineReminderDays: [7, 3, 1] } });
    expect((await admin.request("/api/admin/demonstration", { body: { prices: true } })).json.result.prices).toBeNull();
    expect((await admin.request("/api/admin/settings/alertes")).json.value.stalePriceMonths).toBe(72);
  });

  it("recrée une affaire de démonstration supprimée, jamais l'autre", async () => {
    const [ma] = await ctx.db.select().from(schema.project).where(eq(schema.project.id, first.MA));
    expect((await admin.request(`/api/admin/projects/${first.MA}`, { method: "DELETE", body: { confirmation: ma!.reference } })).status).toBe(200);
    const res = await admin.request("/api/admin/demonstration", { body: { prices: false } });
    const [again, fr] = res.json.result.projects;
    expect(again).toMatchObject({ country: "MA", created: true });
    expect(again.id).not.toBe(first.MA);
    expect(again.reference).not.toBe(ma!.reference);
    expect(fr).toMatchObject({ id: first.FR, created: false });
    const journal = await ctx.db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "demonstration.preparation"));
    expect(journal).toHaveLength(4);
    const creations = await ctx.db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "affaire.creation"));
    expect(creations.filter((a) => (a.details as { demonstration?: boolean }).demonstration)).toHaveLength(3);
  });
});
