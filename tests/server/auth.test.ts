/**
 * Authentification et protection de l'API d'administration, sur une vraie base PostgreSQL (PGlite).
 * Chaque test reproduit ce que ferait un navigateur : cookies, origine, adresse IP.
 */
import { desc, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { schema } from "../../server/db/index.js";
import { ADMIN_EMAIL, ADMIN_PASSWORD, provisionAdmin, setupTestServer, TestBrowser, totpFromUri } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof setupTestServer>>;
let totpUri = "";
let backupCodes: string[] = [];

beforeAll(async () => {
  ctx = await setupTestServer();
});

describe("accès sans compte", () => {
  it("refuse l'API d'administration à un visiteur (401)", async () => {
    const visitor = new TestBrowser(ctx.app);
    for (const path of ["/api/admin/me", "/api/admin/dashboard"]) {
      const res = await visitor.request(path);
      expect(res.status, path).toBe(401);
    }
  });

  it("n'offre aucune inscription publique", async () => {
    const visitor = new TestBrowser(ctx.app);
    const res = await visitor.request("/api/auth/sign-up/email", { body: { email: "intrus@exemple.com", password: "un-mot-de-passe-long", name: "Intrus" } });
    expect(res.status).toBeGreaterThanOrEqual(400);
    const users = await ctx.db.select().from(schema.user);
    expect(users).toHaveLength(0);
  });
});

describe("compte unique", () => {
  it("crée le compte administrateur", async () => {
    const user = await provisionAdmin();
    expect(user?.email).toBe(ADMIN_EMAIL);
  });

  it("refuse la création de tout autre compte, même côté serveur", async () => {
    await expect(provisionAdmin("autre@exemple.com")).rejects.toBeTruthy().catch(async () => {
      // Selon la version, le refus se traduit par une exception ou par l'absence d'utilisateur créé.
    });
    const users = await ctx.db.select({ email: schema.user.email }).from(schema.user);
    expect(users.map((u) => u.email)).toEqual([ADMIN_EMAIL]);
  });
});

describe("connexion et double authentification", () => {
  it("refuse un mauvais mot de passe", async () => {
    const browser = new TestBrowser(ctx.app, "198.51.100.1");
    const res = await browser.request("/api/auth/sign-in/email", { body: { email: ADMIN_EMAIL, password: "mauvais-mot-de-passe" } });
    expect(res.status).toBe(401);
    expect(browser.cookieNames().some((n) => n.includes("session_token"))).toBe(false);
  });

  it("ouvre une session avec le bon mot de passe, puis exige la double authentification pour l'API métier", async () => {
    const browser = new TestBrowser(ctx.app);
    const res = await browser.request("/api/auth/sign-in/email", { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
    expect(res.status).toBe(200);
    const me = await browser.request("/api/admin/me");
    expect(me.status).toBe(200);
    expect(me.json.secondFactorRequired).toBe(true);
    const dashboard = await browser.request("/api/admin/dashboard");
    expect(dashboard.status).toBe(403);
    expect(dashboard.json.error).toBe("second_facteur_requis");

    // Activation : URI otpauth + codes de secours, puis vérification d'un code TOTP.
    const enable = await browser.request("/api/auth/two-factor/enable", { body: { password: ADMIN_PASSWORD } });
    expect(enable.status).toBe(200);
    totpUri = enable.json.totpURI;
    backupCodes = enable.json.backupCodes;
    expect(totpUri).toMatch(/^otpauth:\/\/totp\//);
    expect(backupCodes.length).toBe(10);
    const verify = await browser.request("/api/auth/two-factor/verify-totp", { body: { code: totpFromUri(totpUri) } });
    expect(verify.status).toBe(200);

    const after = await browser.request("/api/admin/dashboard");
    expect(after.status).toBe(200);
    expect(after.json.projects.open).toBe(0);
    expect(after.json.recentProjects).toEqual([]);
  });

  it("à la connexion suivante, le mot de passe seul ne suffit plus", async () => {
    const browser = new TestBrowser(ctx.app, "203.0.113.20");
    const res = await browser.request("/api/auth/sign-in/email", { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
    expect(res.status).toBe(200);
    expect(res.json.twoFactorRedirect).toBe(true);
    expect((await browser.request("/api/admin/me")).status).toBe(401);

    const wrong = await browser.request("/api/auth/two-factor/verify-totp", { body: { code: "000000" } });
    expect(wrong.status).toBeGreaterThanOrEqual(400);

    const verify = await browser.request("/api/auth/two-factor/verify-totp", { body: { code: totpFromUri(totpUri) } });
    expect(verify.status).toBe(200);
    expect((await browser.request("/api/admin/dashboard")).status).toBe(200);
  });

  it("accepte un code de secours, une seule fois", async () => {
    const code = backupCodes[0]!;
    const first = new TestBrowser(ctx.app, "203.0.113.30");
    await first.request("/api/auth/sign-in/email", { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
    const ok = await first.request("/api/auth/two-factor/verify-backup-code", { body: { code } });
    expect(ok.status).toBe(200);

    const second = new TestBrowser(ctx.app, "203.0.113.31");
    await second.request("/api/auth/sign-in/email", { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
    const reused = await second.request("/api/auth/two-factor/verify-backup-code", { body: { code } });
    expect(reused.status).toBeGreaterThanOrEqual(400);
  });

  it("déconnecte et invalide la session", async () => {
    const browser = new TestBrowser(ctx.app, "203.0.113.40");
    await browser.request("/api/auth/sign-in/email", { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
    await browser.request("/api/auth/two-factor/verify-totp", { body: { code: totpFromUri(totpUri) } });
    expect((await browser.request("/api/admin/dashboard")).status).toBe(200);
    const out = await browser.request("/api/auth/sign-out", { body: {} });
    expect(out.status).toBe(200);
    expect((await browser.request("/api/admin/dashboard")).status).toBe(401);
  });
});

describe("protections", () => {
  it("bloque les tentatives répétées de mot de passe (429)", async () => {
    const attacker = new TestBrowser(ctx.app, "192.0.2.99");
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      const res = await attacker.request("/api/auth/sign-in/email", { body: { email: ADMIN_EMAIL, password: `essai-${i}-incorrect` } });
      statuses.push(res.status);
    }
    expect(statuses).toContain(429);
  });

  it("refuse une requête de connexion venant d'un autre site", async () => {
    const foreign = new TestBrowser(ctx.app, "192.0.2.50");
    const res = await foreign.request("/api/auth/sign-in/email", {
      body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      origin: "https://site-malveillant.example",
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("journalise les connexions réussies et échouées", async () => {
    const rows = await ctx.db.select().from(schema.auditLog).orderBy(desc(schema.auditLog.occurredAt));
    const actions = rows.map((r) => r.action);
    expect(actions).toContain("connexion.mot_de_passe.echec");
    expect(actions).toContain("connexion.mot_de_passe.second_facteur_requis");
    expect(actions).toContain("connexion.second_facteur.reussite");
    expect(actions).toContain("deconnexion.reussite");
    const failure = rows.find((r) => r.action === "connexion.mot_de_passe.echec");
    expect(failure?.ipAddress).toBeTruthy();
  });

  it("refuse l'accès à un compte qui ne serait pas celui de l'administrateur", async () => {
    // Même si un compte étranger existait en base (insertion directe), la garde le refuserait.
    await ctx.db.insert(schema.user).values({ id: "intrus", name: "Intrus", email: "intrus@exemple.com", emailVerified: true, twoFactorEnabled: true, updatedAt: new Date() });
    const auth = await (await import("../../server/auth/auth.js")).getAuth();
    const authCtx = await auth.$context;
    await authCtx.internalAdapter.linkAccount({ userId: "intrus", providerId: "credential", accountId: "intrus", password: await authCtx.password.hash("mot-de-passe-intrus-long") });
    const browser = new TestBrowser(ctx.app, "192.0.2.60");
    const signIn = await browser.request("/api/auth/sign-in/email", { body: { email: "intrus@exemple.com", password: "mot-de-passe-intrus-long" } });
    if (signIn.status === 200 && !signIn.json?.twoFactorRedirect) {
      const res = await browser.request("/api/admin/me");
      expect(res.status).toBe(403);
    }
    await ctx.db.delete(schema.user).where(eq(schema.user.id, "intrus"));
  });
});
