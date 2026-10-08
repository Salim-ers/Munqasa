/**
 * Création du compte administrateur au déploiement (ADMIN_PASSWORD), sur une vraie base PostgreSQL :
 * création, correction tant que le compte n'est pas activé, puis variable ignorée.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { schema } from "../../server/db/index.js";
import { resetEnvCache } from "../../server/env.js";
import { bootstrapAdmin } from "../../server/services/admin-bootstrap.js";
import { ADMIN_EMAIL, setupTestServer, TestBrowser, totpFromUri } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof setupTestServer>>;
let totpUri = "";

function withPassword(value: string | undefined) {
  if (value === undefined) delete process.env.ADMIN_PASSWORD;
  else process.env.ADMIN_PASSWORD = value;
  resetEnvCache();
}

async function signIn(password: string, ip: string) {
  const browser = new TestBrowser(ctx.app, ip);
  const res = await browser.request("/api/auth/sign-in/email", { body: { email: ADMIN_EMAIL, password } });
  return { browser, res };
}

beforeAll(async () => {
  ctx = await setupTestServer();
});

afterEach(() => withPassword(undefined));

describe("compte administrateur créé au déploiement", () => {
  it("ne fait rien sans ADMIN_PASSWORD, refuse un mot de passe trop court", async () => {
    withPassword(undefined);
    expect(await bootstrapAdmin()).toBe("variable_absente");
    withPassword("court");
    expect(await bootstrapAdmin()).toBe("trop_courte");
    expect(await ctx.db.select().from(schema.user)).toHaveLength(0);
  });

  it("crée le compte, utilisable aussitôt avec la double authentification exigée", async () => {
    withPassword("Mot-de-passe-initial-1");
    expect(await bootstrapAdmin()).toBe("cree");
    const users = await ctx.db.select().from(schema.user);
    expect(users.map((u) => u.email)).toEqual([ADMIN_EMAIL]);
    // L'empreinte seule est enregistrée.
    const [account] = await ctx.db.select().from(schema.account);
    expect(account!.password).not.toContain("Mot-de-passe-initial-1");

    const { browser, res } = await signIn("Mot-de-passe-initial-1", "198.51.100.71");
    expect(res.status).toBe(200);
    expect((await browser.request("/api/admin/me")).json.secondFactorRequired).toBe(true);
    // Un nouveau déploiement avec la même variable ne change rien et garde la session.
    expect(await bootstrapAdmin()).toBe("deja_a_jour");
    expect((await browser.request("/api/admin/me")).status).toBe(200);
  });

  it("corrige le mot de passe tant que le compte n'est pas activé", async () => {
    withPassword("Mot-de-passe-corrige-2");
    expect(await bootstrapAdmin()).toBe("mot_de_passe_mis_a_jour");
    expect((await signIn("Mot-de-passe-initial-1", "198.51.100.72")).res.status).toBe(401);
    expect((await signIn("Mot-de-passe-corrige-2", "198.51.100.73")).res.status).toBe(200);
  });

  it("ignore la variable une fois la double authentification activée", async () => {
    const { browser } = await signIn("Mot-de-passe-corrige-2", "198.51.100.74");
    const enable = await browser.request("/api/auth/two-factor/enable", { body: { password: "Mot-de-passe-corrige-2" } });
    totpUri = enable.json.totpURI;
    await browser.request("/api/auth/two-factor/verify-totp", { body: { code: totpFromUri(totpUri) } });
    expect((await browser.request("/api/admin/dashboard")).status).toBe(200);

    withPassword("Autre-mot-de-passe-3");
    expect(await bootstrapAdmin()).toBe("deja_active");
    expect((await signIn("Autre-mot-de-passe-3", "198.51.100.75")).res.status).toBe(401);
    const kept = await signIn("Mot-de-passe-corrige-2", "198.51.100.76");
    expect(kept.res.json.twoFactorRedirect).toBe(true);
    expect((await ctx.db.select().from(schema.auditLog)).map((e) => e.action)).toEqual(
      expect.arrayContaining(["compte.cree_au_deploiement", "compte.mot_de_passe_initial_au_deploiement"]),
    );
  });

  it("signale dans l'état du système que la variable reste à supprimer", async () => {
    const { browser } = await signIn("Mot-de-passe-corrige-2", "198.51.100.77");
    await browser.request("/api/auth/two-factor/verify-totp", { body: { code: totpFromUri(totpUri) } });
    withPassword("Autre-mot-de-passe-3");
    expect((await browser.request("/api/admin/system/status")).json.adminPassword).toBe(true);
    withPassword(undefined);
    expect((await browser.request("/api/admin/system/status")).json.adminPassword).toBe(false);
  });
});
