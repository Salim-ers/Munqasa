/**
 * Chargement de la configuration serveur pour les outils de production.
 *
 * La clé OpenAI vit UNIQUEMENT dans .env.local (ignoré par Git) sous le nom
 * OPENAI_API_KEY. Jamais de préfixe VITE_ : Vite exposerait la variable
 * dans le bundle navigateur.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function parseEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

export function loadServerEnv(root = process.cwd()) {
  const file = resolve(root, ".env.local");
  const fileVars = existsSync(file) ? parseEnvFile(file) : {};

  const exposed = Object.keys({ ...fileVars, ...process.env }).filter(
    (k) => k.startsWith("VITE_") && /OPENAI|API_KEY|SECRET|TOKEN/i.test(k),
  );
  if (exposed.length) {
    throw new Error(
      `Variable(s) sensible(s) avec préfixe VITE_ détectée(s) : ${exposed.join(", ")}.\n` +
        "Elles seraient injectées dans le bundle navigateur. Renomme-les (ex. OPENAI_API_KEY).",
    );
  }

  const apiKey = process.env.OPENAI_API_KEY ?? fileVars.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY introuvable. Copie .env.example vers .env.local et renseigne ta clé.",
    );
  }

  return {
    apiKey,
    /** Facultatif : sans valeur, gpt-image-2 puis gpt-image-1 sont essayés. */
    imageModel: process.env.OPENAI_IMAGE_MODEL || fileVars.OPENAI_IMAGE_MODEL || undefined,
  };
}
