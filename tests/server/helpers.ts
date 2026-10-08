/**
 * Outils de test : base PGlite en mémoire migrée, API Hono appelée en direct, navigateur simulé
 * (cookies conservés d'une requête à l'autre), générateur TOTP indépendant (comme une application
 * d'authentification).
 */
import { createHmac } from "node:crypto";
import { connectLocal, setDbForTests } from "../../server/db/index.js";
import { resetAuthForTests, getAuth } from "../../server/auth/auth.js";
import { resetEnvCache } from "../../server/env.js";
import { createApp } from "../../server/http/app.js";

export const ORIGIN = "http://localhost:5173";
export const ADMIN_EMAIL = "admin@talab.test";
export const ADMIN_PASSWORD = "Mot-de-passe-de-test-tres-long!";

export async function setupTestServer() {
  process.env.ADMIN_EMAIL = ADMIN_EMAIL;
  process.env.APP_URL = ORIGIN;
  process.env.BETTER_AUTH_SECRET = "secret-de-test-0123456789-abcdefghijklmnop";
  delete process.env.DATABASE_URL;
  resetEnvCache();
  const db = await connectLocal(undefined);
  setDbForTests(db);
  resetAuthForTests();
  const app = createApp();
  return { db, app };
}

/** Crée le compte administrateur comme le fait `npm run admin -- create`. */
export async function provisionAdmin(email = ADMIN_EMAIL, password = ADMIN_PASSWORD) {
  const auth = await getAuth();
  const ctx = await auth.$context;
  const user = await ctx.internalAdapter.createUser({ email, name: "Administrateur", emailVerified: true }, { method: "admin" });
  if (!user) return null;
  await ctx.internalAdapter.linkAccount({ userId: user.id, providerId: "credential", accountId: user.id, password: await ctx.password.hash(password) });
  return user;
}

/** Navigateur minimal : garde les cookies, envoie l'origine du site. */
export class TestBrowser {
  private cookies = new Map<string, string>();
  constructor(private readonly app: ReturnType<typeof createApp>, private readonly ip = "203.0.113.10") {}

  async request(path: string, init: { method?: string; body?: unknown; origin?: string | null } = {}) {
    const headers = new Headers({ "user-agent": "vitest", "x-forwarded-for": this.ip });
    if (init.origin !== null) headers.set("origin", init.origin ?? ORIGIN);
    if (init.body !== undefined) headers.set("content-type", "application/json");
    if (this.cookies.size) headers.set("cookie", [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "));
    const res = await this.app.fetch(
      new Request(`${ORIGIN}${path}`, { method: init.method ?? (init.body ? "POST" : "GET"), headers, body: init.body ? JSON.stringify(init.body) : undefined }),
    );
    for (const cookie of res.headers.getSetCookie()) {
      const [pair] = cookie.split(";");
      const eq = pair!.indexOf("=");
      const name = pair!.slice(0, eq).trim();
      const value = pair!.slice(eq + 1).trim();
      if (!value || /max-age=0/i.test(cookie)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    return { status: res.status, json, headers: res.headers };
  }

  cookieNames() {
    return [...this.cookies.keys()];
  }
}

/** TOTP RFC 6238 (SHA-1, 30 s, 6 chiffres) à partir du secret base32 de l'URI otpauth://. */
export function totpFromUri(uri: string, at = Date.now()): string {
  const secret = new URL(uri).searchParams.get("secret");
  if (!secret) throw new Error("secret absent de l'URI");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of secret.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(ch).toString(2).padStart(5, "0");
  const bytes = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const hmac = createHmac("sha1", bytes).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0xf;
  const code = ((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
  return code;
}
