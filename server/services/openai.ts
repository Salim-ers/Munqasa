/**
 * Accès à l'API OpenAI, côté serveur uniquement. La clé ne quitte jamais le serveur.
 * Chaque appel est journalisé (agent_run, ai_usage_record) avec son coût estimé d'après le barème
 * saisi dans les paramètres IA (aucun prix supposé). Le plafond mensuel est vérifié avant l'appel.
 */
import { gte, sum } from "drizzle-orm";
import OpenAI from "openai";
import { getDb, schema } from "../db/index.js";
import { ConfigError, getEnv } from "../env.js";
import { Dec } from "./decimal.js";
import { readSetting } from "./settings.js";

let client: OpenAI | null = null;

export class AiBudgetError extends Error {
  constructor() {
    super("Plafond mensuel de dépense IA atteint.");
  }
}

export function getOpenAI(): OpenAI {
  const env = getEnv();
  if (!env.OPENAI_API_KEY) throw new ConfigError("OPENAI_API_KEY n'est pas défini.");
  client ??= new OpenAI({ apiKey: env.OPENAI_API_KEY, maxRetries: 2, timeout: 120_000 });
  return client;
}

/** Modèles déclarés disponibles par l'API pour ce compte (identifiants réels, jamais supposés). */
export async function listModels(): Promise<string[]> {
  const ids: string[] = [];
  for await (const model of getOpenAI().models.list()) ids.push(model.id);
  return ids.sort();
}

/** Coût estimé en dollars, ou null si le barème de ce modèle n'a pas été saisi. */
export async function estimateCostUsd(model: string, usage: { input: number; cachedInput: number; output: number }): Promise<string | null> {
  const settings = await readSetting("ia");
  const price = settings.pricing[model];
  if (!price || !price.input || !price.output) return null;
  const perToken = (v: string) => new Dec(v || "0").div(1_000_000);
  const uncached = Math.max(0, usage.input - usage.cachedInput);
  const cost = perToken(price.input)
    .mul(uncached)
    .plus(perToken(price.cachedInput || price.input).mul(usage.cachedInput))
    .plus(perToken(price.output).mul(usage.output));
  return cost.toDecimalPlaces(6).toString();
}

/** Dépense estimée du mois civil en cours. */
export async function monthSpendUsd(): Promise<string> {
  const db = await getDb();
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const [row] = await db.select({ total: sum(schema.aiUsageRecord.costUsd) }).from(schema.aiUsageRecord).where(gte(schema.aiUsageRecord.createdAt, start));
  return row?.total ?? "0";
}

/** Refuse un nouvel appel si le plafond mensuel (saisi) est atteint. */
export async function assertBudget(): Promise<void> {
  const settings = await readSetting("ia");
  if (!settings.monthlyBudgetUsd) return;
  if (new Dec(await monthSpendUsd()).gte(settings.monthlyBudgetUsd)) throw new AiBudgetError();
}

/** Enregistre la consommation d'un appel. */
export async function recordUsage(
  model: string,
  usage: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } } | undefined | null,
  agentRunId: string | null = null,
): Promise<void> {
  const input = usage?.input_tokens ?? 0;
  const cachedInput = usage?.input_tokens_details?.cached_tokens ?? 0;
  const output = usage?.output_tokens ?? 0;
  const db = await getDb();
  await db.insert(schema.aiUsageRecord).values({
    agentRunId,
    model,
    inputTokens: input,
    cachedInputTokens: cachedInput,
    outputTokens: output,
    costUsd: await estimateCostUsd(model, { input, cachedInput, output }),
  });
}
