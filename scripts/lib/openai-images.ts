/**
 * Client minimal de l'API Images d'OpenAI (Node ≥ 20 : fetch/FormData natifs).
 * Utilisé uniquement par les scripts de production — jamais par le site.
 *
 * Modèles essayés dans l'ordre (sauf si OPENAI_IMAGE_MODEL est défini) :
 *   gpt-image-2  → tailles libres, 2560×1440 natif
 *   gpt-image-1  → 1536×1024 maximum (repli si le compte n'a pas accès au précédent)
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const API = "https://api.openai.com/v1/images";
const TIMEOUT_MS = 8 * 60_000;

export type Size = `${number}x${number}`;

export interface ModelProfile {
  model: string;
  /** Taille demandée en priorité, puis repli. */
  sizes: Size[];
  quality: string;
  /** Le paramètre input_fidelity est-il accepté pour l'édition ? */
  inputFidelity: boolean;
}

export const PROFILES: Record<string, ModelProfile> = {
  "gpt-image-2": { model: "gpt-image-2", sizes: ["2560x1440", "1536x1024"], quality: "high", inputFidelity: false },
  "gpt-image-1": { model: "gpt-image-1", sizes: ["1536x1024"], quality: "high", inputFidelity: true },
};

export function profilesFor(override?: string): ModelProfile[] {
  if (override) return [PROFILES[override] ?? { model: override, sizes: ["1536x1024"], quality: "high", inputFidelity: true }];
  return [PROFILES["gpt-image-2"]!, PROFILES["gpt-image-1"]!];
}

export class OpenAIImageError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
  /** Le modèle n'existe pas ou n'est pas accessible avec cette clé. */
  get isModelUnavailable() {
    return this.status === 404 || (this.status === 403 && /model/i.test(this.message)) || /model.*(not|does not) (exist|found|available)|access to (the )?model|must be verified/i.test(this.message);
  }
  mentions(param: string) {
    return new RegExp(param, "i").test(this.message);
  }
}

interface ImagesResponse {
  data?: { b64_json?: string }[];
  error?: { message?: string };
}

const MAX_ATTEMPTS = 5;

async function call(endpoint: string, init: RequestInit): Promise<Buffer[]> {
  let res: Response | undefined;
  let json: ImagesResponse = {};
  // Limite de débit (429) ou incident serveur (5xx) : nouvel essai avec attente croissante.
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    res = await fetch(`${API}/${endpoint}`, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    json = (await res.json().catch(() => ({}))) as ImagesResponse;
    const retryable = res.status === 429 || res.status >= 500;
    if (res.ok || !retryable || attempt === MAX_ATTEMPTS) break;
    const wait = Number(res.headers.get("retry-after")) * 1000 || 8000 * 2 ** (attempt - 1);
    console.warn(`  ↻ HTTP ${res.status} — nouvel essai dans ${Math.round(wait / 1000)} s`);
    await new Promise((r) => setTimeout(r, wait));
  }
  if (!res?.ok) {
    // Ne jamais réafficher les en-têtes : ils contiennent la clé.
    throw new OpenAIImageError(`OpenAI ${endpoint} — HTTP ${res?.status} : ${json.error?.message ?? "réponse illisible"}`, res?.status ?? 0);
  }
  const images = (json.data ?? []).map((d) => d.b64_json).filter(Boolean) as string[];
  if (!images.length) throw new OpenAIImageError(`OpenAI ${endpoint} : aucune image renvoyée.`, 500);
  return images.map((b64) => Buffer.from(b64, "base64"));
}

interface Request {
  apiKey: string;
  prompt: string;
  n?: number;
}

function generateOnce(o: Request & { profile: ModelProfile; size: Size }): Promise<Buffer[]> {
  return call("generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${o.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: o.profile.model,
      prompt: o.prompt,
      size: o.size,
      quality: o.profile.quality,
      n: o.n ?? 1,
      output_format: "png",
    }),
  });
}

function editOnce(o: Request & { profile: ModelProfile; size: Size; imagePath: string; fidelity: boolean }): Promise<Buffer[]> {
  const form = new FormData();
  form.append("model", o.profile.model);
  form.append("prompt", o.prompt);
  form.append("size", o.size);
  form.append("quality", o.profile.quality);
  form.append("n", String(o.n ?? 1));
  if (o.fidelity) form.append("input_fidelity", "high");
  form.append("output_format", "png");
  form.append("image", new Blob([readFileSync(o.imagePath)], { type: "image/png" }), basename(o.imagePath));
  return call("edits", { method: "POST", headers: { Authorization: `Bearer ${o.apiKey}` }, body: form });
}

export interface Result {
  images: Buffer[];
  model: string;
  size: Size;
}

/**
 * Génère en essayant les modèles puis les tailles dans l'ordre ; chaque repli
 * est annoncé dans le terminal (rien n'est masqué).
 */
export async function generateImages(o: Request & { modelOverride?: string }): Promise<Result> {
  let last: unknown;
  for (const profile of profilesFor(o.modelOverride)) {
    for (const size of profile.sizes) {
      try {
        return { images: await generateOnce({ ...o, profile, size }), model: profile.model, size };
      } catch (err) {
        last = err;
        if (!(err instanceof OpenAIImageError)) throw err;
        if (err.isModelUnavailable) {
          console.warn(`  ↪ ${profile.model} indisponible pour cette clé — essai du modèle suivant.`);
          break;
        }
        if (err.mentions("size")) {
          console.warn(`  ↪ ${profile.model} refuse ${size} — essai d'une taille plus petite.`);
          continue;
        }
        throw err;
      }
    }
  }
  throw last instanceof Error ? last : new Error("Aucun modèle d'image disponible.");
}

/** Édition d'une image existante — haute fidélité pour préserver la géométrie. */
export async function editImage(o: Request & { imagePath: string; size: Size; modelOverride?: string; preferModel?: string }): Promise<Result> {
  let last: unknown;
  const profiles = profilesFor(o.modelOverride).sort((a, b) => Number(b.model === o.preferModel) - Number(a.model === o.preferModel));
  for (const profile of profiles) {
    let fidelity = profile.inputFidelity;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return { images: await editOnce({ ...o, profile, size: o.size, fidelity }), model: profile.model, size: o.size };
      } catch (err) {
        last = err;
        if (!(err instanceof OpenAIImageError)) throw err;
        if (err.isModelUnavailable) {
          console.warn(`  ↪ ${profile.model} indisponible pour l'édition — essai du modèle suivant.`);
          break;
        }
        if (fidelity && err.mentions("input_fidelity")) {
          console.warn(`  ↪ ${profile.model} n'accepte pas input_fidelity — nouvel essai sans ce paramètre.`);
          fidelity = false;
          continue;
        }
        throw err;
      }
    }
  }
  throw last instanceof Error ? last : new Error("Aucun modèle d'édition disponible.");
}
