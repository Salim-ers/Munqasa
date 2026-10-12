/**
 * Connexion sans double authentification (configuration par défaut, TALAB_2FA absente), sur une vraie base
 * PostgreSQL : mot de passe seul, aucun code demandé, protections intactes (mot de passe haché, limitation
 * des tentatives, contrôle d'origine, compte unique, sessions, journal) ; puis réactivation par la
 * configuration, qui retrouve le secret TOTP conservé en base, et nouvelle désactivation sans rien perdre.
 */
import { desc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetAuthForTests } from "../../server/auth/auth.js";
import { schema } from "../../server/db/index.js";
import { resetEnvCache } from "../../server/env.js";
import { ADMIN_EMAIL, ADMIN_PASSWORD, provisionAdmin, setupTestServer, TestBrowser, totpFromUri } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof setupTestServer>>;

function policy(value: "obligatoire" | null) {
  if (value) process.env.TALAB_2FA = value;
  else delete process.env.TALAB_2FA;
  resetEnvCache();
  resetAuthForTests();
}

const signIn = async (ip: string, password = ADMIN_PASSWORD) => {
  const browser = new TestBrowser(ctx.app, ip);
  const res = await browser.request("/api/auth/sign-in/email", { body: { email: ADMIN_EMAIL, password } });
  return { browser, res };
};

beforeAll(async () => {
  delete process.env.TALAB_2FA;
  ctx = await setupTestServer();
  await provisionAdmin();
});

afterAll(() => policy(null));

describe("connexion sans double authentification", () => {
  it("ouvre une session par adresse et mot de passe, sans code, et donne accès à l'API métier", async () => {
    const { browser, res } = await signIn("198.51.100.1");
    expect(res.status).toBe(200);
    expect(res.json.twoFactorRedirect).toBeUndefined();
    expect(browser.cookieNames().some((n) => n.includes("session_token"))).toBe(true);
    const me = await browser.request("/api/admin/me");
    expect(me.json).toMatchObject({ secondFactorRequired: false, secondFactorPolicy: "desactivee" });
    expect((await browser.request("/api/admin/projects")).status).toBe(200);
  });

  it("ne propose plus les routes du second facteur", async () => {
    const { browser } = await signIn("198.51.100.2");
    expect((await browser.request("/api/auth/two-factor/enable", { body: { password: ADMIN_PASSWORD } })).status).toBe(404);
  });

  it("garde le mot de passe haché en base", async () => {
    const [account] = await ctx.db.select().from(schema.account).where(eq(schema.account.providerId, "credential"));
    expect(account!.password).toBeTruthy();
    expect(account!.password).not.toContain(ADMIN_PASSWORD);
  });

  it("refuse un mauvais mot de passe et limite les tentatives répétées (429)", async () => {
    expect((await signIn("198.51.100.3", "mauvais-mot-de-passe-0000")).res.status).toBe(401);
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await signIn("198.51.100.4", "mauvais-mot-de-passe-0000")).res.status);
    expect(statuses).toContain(429);
  });

  it("refuse une connexion venant d'un autre site et toute requête modifiante d'origine étrangère", async () => {
    const browser = new TestBrowser(ctx.app, "198.51.100.5");
    const res = await browser.request("/api/auth/sign-in/email", { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }, origin: "https://site-malveillant.example" });
    expect(res.status).toBe(403);
    const { browser: admin } = await signIn("198.51.100.6");
    expect((await admin.request("/api/admin/clients", { body: { name: "Essai", sector: "public", country: "MA" }, origin: "https://site-malveillant.example" })).status).toBe(403);
  });

  it("refuse l'API à un visiteur et tout autre compte que celui de l'administrateur", async () => {
    expect((await new TestBrowser(ctx.app, "198.51.100.7").request("/api/admin/projects")).status).toBe(401);
    expect(await provisionAdmin("intrus@example.com", "Un-autre-mot-de-passe-long!")).toBeNull();
  });

  it("journalise la connexion avec la politique en vigueur", async () => {
    await signIn("198.51.100.8");
    const [last] = await ctx.db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "connexion.mot_de_passe.reussite")).orderBy(desc(schema.auditLog.occurredAt)).limit(1);
    expect(last).toMatchObject({ ipAddress: "198.51.100.8", details: { doubleAuthentification: "desactivee" } });
  });

  it("liste les sessions et les ferme à la déconnexion", async () => {
    const { browser } = await signIn("198.51.100.9");
    expect((await browser.request("/api/auth/list-sessions")).status).toBe(200);
    expect((await browser.request("/api/auth/sign-out", { body: {} })).status).toBe(200);
    expect((await browser.request("/api/admin/me")).status).toBe(401);
  });
});

describe("réactivation par la configuration, sans migration", () => {
  let totpUri = "";

  it("TALAB_2FA=obligatoire : le second facteur est de nouveau exigé, puis activé", async () => {
    policy("obligatoire");
    const { browser, res } = await signIn("198.51.100.20");
    expect(res.status).toBe(200);
    expect((await browser.request("/api/admin/me")).json).toMatchObject({ secondFactorRequired: true, secondFactorPolicy: "obligatoire" });
    expect((await browser.request("/api/admin/projects")).json.error).toBe("second_facteur_requis");
    const enable = await browser.request("/api/auth/two-factor/enable", { body: { password: ADMIN_PASSWORD } });
    totpUri = enable.json.totpURI;
    expect((await browser.request("/api/auth/two-factor/verify-totp", { body: { code: totpFromUri(totpUri) } })).status).toBe(200);
    expect((await browser.request("/api/admin/projects")).status).toBe(200);
  });

  it("désactivée de nouveau : connexion par mot de passe seul, secret et réglages conservés en base", async () => {
    policy(null);
    const { browser, res } = await signIn("198.51.100.21");
    expect(res.status).toBe(200);
    expect(res.json.twoFactorRedirect).toBeUndefined();
    expect((await browser.request("/api/admin/projects")).status).toBe(200);
    const [user] = await ctx.db.select().from(schema.user);
    expect(user!.twoFactorEnabled).toBe(true);
    expect(await ctx.db.select().from(schema.twoFactor)).toHaveLength(1);
  });

  it("réactivée : le code de la même application d'authentification est demandé et accepté", async () => {
    policy("obligatoire");
    const { browser, res } = await signIn("198.51.100.22");
    expect(res.json.twoFactorRedirect).toBe(true);
    expect((await browser.request("/api/admin/projects")).status).toBe(401);
    const verify = await browser.request("/api/auth/two-factor/verify-totp", { body: { code: totpFromUri(totpUri) } });
    expect(verify.status).toBe(200);
    expect((await browser.request("/api/admin/projects")).status).toBe(200);
  });
});
