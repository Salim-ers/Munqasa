/**
 * Traitement serveur du formulaire de contact.
 * Utilisé par la fonction Vercel (api/contact.ts) et par le serveur de
 * développement Vite. La validation qui fait foi est ici, jamais dans le
 * navigateur.
 */
import { formatContactEmail, validateContact, type ContactRequest } from "../../src/lib/contact.js";

export interface ContactEnv {
  RESEND_API_KEY?: string;
  CONTACT_TO?: string;
  CONTACT_FROM?: string;
  /** En développement, la demande est affichée dans la console si l'envoi n'est pas configuré. */
  dev?: boolean;
}

const MAX_BODY_BYTES = 16_000;
const MIN_FILL_MS = 2_500;
const RATE_WINDOW_MS = 10 * 60_000;
const RATE_MAX = 5;

/**
 * Limitation de débit en mémoire, par instance : suffisante contre les envois
 * en rafale. Pour une limite globale, brancher un stockage partagé (KV/Redis).
 */
const hits = new Map<string, number[]>();

function rateLimited(ip: string, now: number): boolean {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5_000) {
    for (const [key, times] of hits) if (times.every((t) => now - t >= RATE_WINDOW_MS)) hits.delete(key);
  }
  return recent.length > RATE_MAX;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

/** Refuse les requêtes envoyées depuis un autre site. */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

async function deliver(data: ContactRequest, env: ContactEnv): Promise<"sent" | "logged" | "unconfigured"> {
  const { subject, text } = formatContactEmail(data);
  if (env.RESEND_API_KEY && env.CONTACT_TO && env.CONTACT_FROM) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.CONTACT_FROM, to: [env.CONTACT_TO], reply_to: data.email, subject, text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Resend HTTP ${res.status}`);
    return "sent";
  }
  if (env.dev) {
    console.info(`\n[contact] ${subject}\n${text}\n`);
    return "logged";
  }
  return "unconfigured";
}

export async function handleContact(request: Request, env: ContactEnv): Promise<Response> {
  if (request.method !== "POST") return json(405, { ok: false, error: "Méthode non autorisée." });
  if (!sameOrigin(request)) return json(403, { ok: false, error: "Origine refusée." });
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return json(415, { ok: false, error: "Format non pris en charge." });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json(413, { ok: false, error: "Demande trop volumineuse." });

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return json(400, { ok: false, error: "Demande illisible." });
  }

  const now = Date.now();
  if (rateLimited(clientIp(request), now)) {
    return json(429, { ok: false, error: "Trop de demandes. Réessayez dans quelques minutes." });
  }

  // Pièges à robots : champ caché rempli ou formulaire soumis trop vite.
  // La réponse reste « succès » pour ne rien leur apprendre.
  const startedAt = typeof body.startedAt === "number" ? body.startedAt : 0;
  if ((typeof body.website === "string" && body.website.trim() !== "") || now - startedAt < MIN_FILL_MS) {
    return json(200, { ok: true });
  }

  const result = validateContact(body);
  if (!result.ok) return json(422, { ok: false, errors: result.errors });

  try {
    const status = await deliver(result.data, env);
    if (status === "unconfigured") {
      console.error("[contact] Envoi non configuré : RESEND_API_KEY, CONTACT_TO et CONTACT_FROM sont requis.");
      return json(503, { ok: false, error: "Le service de réception n'est pas encore configuré." });
    }
    return json(200, { ok: true });
  } catch (err) {
    console.error("[contact] Échec de l'envoi :", err instanceof Error ? err.message : err);
    return json(502, { ok: false, error: "L'envoi a échoué. Réessayez dans un instant." });
  }
}
