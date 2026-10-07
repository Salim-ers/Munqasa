/**
 * Client minimal de l'API Images d'OpenAI (Node ≥ 20 : fetch/FormData natifs).
 * Utilisé uniquement par les scripts de production — jamais par le site.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const API = "https://api.openai.com/v1/images";
const TIMEOUT_MS = 6 * 60_000;

type Size = "1536x1024" | "1024x1024" | "1024x1536";
type Quality = "high" | "medium" | "low";

interface Common {
  apiKey: string;
  model: string;
  prompt: string;
  size?: Size;
  quality?: Quality;
  n?: number;
}

interface ImagesResponse {
  data?: { b64_json?: string }[];
  error?: { message?: string };
}

async function call(endpoint: string, init: RequestInit): Promise<Buffer[]> {
  const res = await fetch(`${API}/${endpoint}`, {
    ...init,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => ({}))) as ImagesResponse;
  if (!res.ok) {
    // Ne jamais réafficher les en-têtes : ils contiennent la clé.
    throw new Error(`OpenAI ${endpoint} — HTTP ${res.status} : ${json.error?.message ?? "réponse illisible"}`);
  }
  const images = (json.data ?? []).map((d) => d.b64_json).filter(Boolean) as string[];
  if (!images.length) throw new Error(`OpenAI ${endpoint} : aucune image renvoyée.`);
  return images.map((b64) => Buffer.from(b64, "base64"));
}

export function generateImages(o: Common): Promise<Buffer[]> {
  return call("generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${o.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: o.model,
      prompt: o.prompt,
      size: o.size ?? "1536x1024",
      quality: o.quality ?? "high",
      n: o.n ?? 1,
      output_format: "png",
    }),
  });
}

/** Édition d'une image existante — `input_fidelity: high` pour préserver la géométrie. */
export function editImage(o: Common & { imagePath: string }): Promise<Buffer[]> {
  const form = new FormData();
  form.append("model", o.model);
  form.append("prompt", o.prompt);
  form.append("size", o.size ?? "1536x1024");
  form.append("quality", o.quality ?? "high");
  form.append("n", String(o.n ?? 1));
  form.append("input_fidelity", "high");
  form.append("output_format", "png");
  form.append(
    "image",
    new Blob([readFileSync(o.imagePath)], { type: "image/png" }),
    basename(o.imagePath),
  );
  return call("edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${o.apiKey}` },
    body: form,
  });
}
