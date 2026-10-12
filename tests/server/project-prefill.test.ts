/**
 * Préremplissage d'une affaire depuis le texte des cartouches (phase 9), sur une vraie base et un fournisseur IA
 * simulé : accord d'envoi exigé, valeurs retenues seulement si le passage cité figure mot pour mot sur un plan,
 * valeur sans passage écartée et signalée, client déjà connu reconnu avec son pays, type d'opération déduit de
 * l'intitulé retenu.
 */
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { setAiProviderForTests } from "../../server/ai/client.js";
import { fakeProvider } from "../../server/ai/fake.js";
import { schema } from "../../server/db/index.js";
import { comparable, projectTypeOf, verifiedField } from "../../server/services/project-prefill.js";
import { adminSession, setupTestServer, type TestBrowser } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof setupTestServer>>;
let admin: TestBrowser;

// Texte vectoriel d'un cartouche réel (PLAN METRIKA), tel que le navigateur le lit : une ligne par texte.
const CARTOUCHE = [
  "CONSTRUCTION DE 11 LOGEMENTS DANS LE CENTRE",
  "BOURG DE FERRIERES SUR ARIEGE",
  "Maîtrise d'ouvrage",
  "OPH de l'Ariège",
  "23 b rue de Ferrières",
  "Commune : Ferrières-sur-Ariège",
  "Maîtrise d'oeuvre :",
  "ARCHITECTURE ET PAYSAGE sarl",
  "09300 LAVELANET",
  "PLAN DE VRD",
  "Echelle 1 : 75",
].join("\n");

beforeAll(async () => {
  ctx = await setupTestServer();
  admin = (await adminSession(ctx.app)).browser;
  setAiProviderForTests(fakeProvider);
});

describe("vérification des valeurs lues", () => {
  it("compare sans accents, ponctuation ni casse", () => {
    expect(comparable("Maîtrise d’œuvre : ARCHITECTURE")).toBe("maitrise d uvre architecture");
    expect(comparable("Ferrières-sur-Ariège")).toBe("ferrieres sur ariege");
  });

  it("ne retient une valeur que si son passage figure sur un plan et la contient", () => {
    const files = [{ name: "PLAN METRIKA.pdf", text: CARTOUCHE }];
    expect(verifiedField({ value: "OPH de l’Ariège", quote: "OPH de l'Ariège" }, files)).toEqual({ value: "OPH de l’Ariège", file: "PLAN METRIKA.pdf", quote: "OPH de l'Ariège" });
    // Passage absent du texte, ou valeur qui ajoute un mot : écartée.
    expect(verifiedField({ value: "OPH de l'Ariège", quote: "Office public de l'habitat de l'Ariège" }, files)).toBeNull();
    expect(verifiedField({ value: "OPH de l'Ariège, Foix", quote: "OPH de l'Ariège" }, files)).toBeNull();
    expect(verifiedField(null, files)).toBeNull();
  });

  it("déduit le type d'opération de l'intitulé", () => {
    expect(projectTypeOf("Construction de 11 logements")?.value).toBe("logements");
    expect(projectTypeOf("Réhabilitation du lycée Ibn Khaldoun")?.value).toBe("rehabilitation");
    expect(projectTypeOf("Voirie et réseaux divers du lotissement")?.value).toBe("vrd");
    expect(projectTypeOf("Construction d'un groupe scolaire")?.value).toBe("batiment");
  });
});

describe("préremplissage depuis les plans", () => {
  it("exige l'accord d'envoi du texte à l'API", async () => {
    const res = await admin.request("/api/admin/projects/prefill", { body: { files: [{ name: "PLAN METRIKA.pdf", text: CARTOUCHE }] } });
    expect(res.status).toBe(400);
    expect(res.json.fields.consent).toBe("Confirmez l’envoi du texte des plans à l’API OpenAI.");
  });

  it("propose les valeurs citées sur le plan et écarte celles sans passage vérifiable", async () => {
    const res = await admin.request("/api/admin/projects/prefill", { body: { files: [{ name: "PLAN METRIKA.pdf", text: CARTOUCHE }], consent: true } });
    expect(res.status).toBe(200);
    const p = res.json.prefill;
    expect(p.name).toEqual({ value: "Construction de 11 logements dans le centre", file: "PLAN METRIKA.pdf", quote: "CONSTRUCTION DE 11 LOGEMENTS DANS LE CENTRE" });
    expect(p.client).toMatchObject({ value: "OPH de l'Ariège", clientId: null, clientName: null });
    expect(p.city).toMatchObject({ value: "Ferrières-sur-Ariège", quote: "Commune : Ferrières-sur-Ariège" });
    expect(p.projectType).toEqual({ value: "logements", reason: "intitulé : logements" });
    // « Démolition totale » ne figure pas sur le plan : non repris, et c'est dit.
    expect(p.worksNature).toBeNull();
    expect(p.notes).toContain("Nature des travaux proposé sans passage vérifiable sur les plans : non repris.");
    // Pays jamais supposé sans client connu.
    expect(p.country).toBeNull();
    const runs = await ctx.db.select().from(schema.agentRun).where(eq(schema.agentRun.agent, "analyste_documents"));
    expect(runs).toHaveLength(1);
  });

  it("reconnaît un client déjà enregistré et en reprend le pays", async () => {
    const client = await admin.request("/api/admin/clients", { body: { name: "OPH de l’Ariège", sector: "public", country: "FR" } });
    const res = await admin.request("/api/admin/projects/prefill", { body: { files: [{ name: "PLAN METRIKA.pdf", text: CARTOUCHE }], consent: true } });
    expect(res.json.prefill.client).toMatchObject({ clientId: client.json.client.id, clientName: "OPH de l’Ariège" });
    expect(res.json.prefill.country).toEqual({ value: "FR", reason: "pays du client OPH de l’Ariège" });
  });
});
