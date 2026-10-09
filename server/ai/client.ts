/**
 * Appels aux agents IA : API OpenAI Responses, sorties structurées validées par un schéma Zod.
 * Chaque appel vérifie le plafond mensuel, utilise le modèle choisi dans les paramètres IA, est journalisé
 * (agent_run) avec sa consommation. Les plans sont transmis en fichier temporaire, supprimé après l'appel.
 * La clé ne quitte jamais le serveur ; les documents ne partent qu'à la demande explicite de l'administrateur.
 */
import { eq } from "drizzle-orm";
import OpenAI, { toFile } from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { ResponseInput } from "openai/resources/responses/responses";
import type { z } from "zod";
import { getDb, schema } from "../db/index.js";
import { getEnv } from "../env.js";
import { assertBudget, getOpenAI, recordUsage } from "../services/openai.js";
import { readSetting } from "../services/settings.js";

export type AgentName = "lecteur_plans" | "metreur" | "redacteur_cctp" | "economiste_dpgf" | "sous_detail";
export type ModelRole = "generation" | "extraction";

/** Configuration à corriger par l'administrateur (modèle absent, clé refusée…) : inutile de réessayer. */
export class AiConfigError extends Error {}
/** Incident passager (débit, réseau, réponse incomplète) : l'étape est retentée. */
export class AiRetriableError extends Error {}
/** Le modèle a refusé de répondre. */
export class AiRefusalError extends Error {}

export interface AiCall<S extends z.ZodType> {
  agent: AgentName;
  role: ModelRole;
  projectId: string | null;
  jobId: string | null;
  instructions: string;
  input: ResponseInput | string;
  schema: S;
  schemaName: string;
  /** Résumé lisible de l'entrée, conservé dans le journal des exécutions. */
  summary: string;
  maxOutputTokens?: number;
  effort?: "low" | "medium" | "high";
}

export interface AiUsage {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { cached_tokens?: number };
}

export interface AiProvider {
  readonly name: string;
  run<S extends z.ZodType>(call: AiCall<S>, model: string): Promise<{ output: unknown; usage: AiUsage | null; responseId: string | null }>;
  uploadFile(data: Uint8Array, fileName: string): Promise<string>;
  deleteFile(id: string): Promise<void>;
}

/** Modèles de raisonnement : l'effort de réflexion se règle, la température non. */
function supportsReasoning(model: string): boolean {
  return /^(o[1-9]|gpt-5|gpt-6)/i.test(model);
}

function mapOpenAiError(error: unknown, model: string): Error {
  if (error instanceof AiConfigError || error instanceof AiRetriableError || error instanceof AiRefusalError) return error;
  if (error instanceof OpenAI.APIConnectionError) return new AiRetriableError("Connexion à l’API OpenAI interrompue.");
  if (error instanceof OpenAI.APIError) {
    const status = error.status ?? 0;
    if (status === 401 || status === 403) return new AiConfigError("Clé OpenAI refusée : vérifiez OPENAI_API_KEY sur Vercel.");
    if (status === 404) return new AiConfigError(`Modèle « ${model} » indisponible pour ce compte OpenAI : choisissez-en un autre dans les paramètres IA.`);
    if (status === 413) return new AiConfigError("Document trop volumineux pour l’API OpenAI.");
    if (status === 429) {
      return error.code === "insufficient_quota" ? new AiConfigError("Crédit OpenAI épuisé : rechargez le compte OpenAI.") : new AiRetriableError("Limite de débit OpenAI atteinte : nouvel essai.");
    }
    if (status >= 500) return new AiRetriableError("L’API OpenAI ne répond pas correctement : nouvel essai.");
    return new AiConfigError(`Requête refusée par l’API OpenAI : ${error.message.slice(0, 300)}`);
  }
  return error instanceof Error ? error : new Error(String(error));
}

const openAiProvider: AiProvider = {
  name: "openai",
  async run(call, model) {
    const settings = await readSetting("ia");
    try {
      const response = await getOpenAI().responses.parse({
        model,
        instructions: call.instructions,
        input: call.input,
        text: { format: zodTextFormat(call.schema, call.schemaName) },
        max_output_tokens: call.maxOutputTokens ?? 16_000,
        store: settings.storeResponses,
        ...(supportsReasoning(model) ? { reasoning: { effort: call.effort ?? "medium" } } : {}),
      });
      if (response.status === "incomplete") {
        throw new AiRetriableError(`Réponse incomplète (${response.incomplete_details?.reason === "max_output_tokens" ? "longueur maximale atteinte" : "interrompue"}).`);
      }
      for (const item of response.output) {
        if (item.type === "message") {
          for (const part of item.content) if (part.type === "refusal") throw new AiRefusalError(`Le modèle a refusé de répondre : ${part.refusal.slice(0, 200)}`);
        }
      }
      if (response.output_parsed == null) throw new AiRetriableError("Réponse vide du modèle.");
      return { output: response.output_parsed, usage: response.usage ?? null, responseId: response.id };
    } catch (error) {
      throw mapOpenAiError(error, model);
    }
  },
  async uploadFile(data, fileName) {
    try {
      const file = await getOpenAI().files.create({ file: await toFile(data, fileName), purpose: "user_data" });
      return file.id;
    } catch (error) {
      throw mapOpenAiError(error, "fichiers");
    }
  },
  async deleteFile(id) {
    await getOpenAI()
      .files.delete(id)
      .catch(() => undefined);
  },
};

let override: AiProvider | null = null;

/** Tests : fournisseur simulé, sans appel externe. */
export function setAiProviderForTests(provider: AiProvider | null): void {
  override = provider;
}

/** Démonstration locale sans clé (TALAB_FAKE_AI=1, jamais en production). */
async function currentProvider(): Promise<AiProvider> {
  if (override) return override;
  if (!getEnv().isProduction && process.env.TALAB_FAKE_AI === "1") return (await import("./fake.js")).fakeProvider;
  return openAiProvider;
}

export async function aiFiles(): Promise<Pick<AiProvider, "uploadFile" | "deleteFile">> {
  return currentProvider();
}

/** Modèle à utiliser pour un rôle, ou erreur claire s'il n'a pas été choisi. */
export async function modelFor(role: ModelRole): Promise<string> {
  const provider = await currentProvider();
  if (provider.name !== "openai") return provider.name;
  const settings = await readSetting("ia");
  const model = role === "extraction" ? settings.extractionModel || settings.generationModel : settings.generationModel;
  if (!model) throw new AiConfigError("Aucun modèle choisi : renseignez-le dans Paramètres > Intelligence artificielle.");
  if (!getEnv().OPENAI_API_KEY) throw new AiConfigError("Clé OpenAI absente : ajoutez OPENAI_API_KEY sur Vercel.");
  return model;
}

/** Appel d'un agent : sortie validée par le schéma, exécution et consommation journalisées. */
export async function callAgent<S extends z.ZodType>(call: AiCall<S>): Promise<z.output<S>> {
  const provider = await currentProvider();
  const model = await modelFor(call.role);
  await assertBudget();
  const db = await getDb();
  const [run] = await db
    .insert(schema.agentRun)
    .values({ agent: call.agent, model, projectId: call.projectId, jobId: call.jobId, inputSummary: call.summary.slice(0, 500), status: "en_cours" })
    .returning({ id: schema.agentRun.id });
  try {
    const result = await provider.run(call, model);
    // Validation de défense : la sortie doit respecter le schéma, quel que soit le fournisseur.
    const parsed = call.schema.safeParse(result.output);
    if (!parsed.success) throw new AiRetriableError("Réponse du modèle non conforme au format attendu.");
    if (provider.name === "openai") await recordUsage(model, result.usage, run!.id);
    await db
      .update(schema.agentRun)
      .set({ status: "termine", output: parsed.data as object, responseId: result.responseId, finishedAt: new Date() })
      .where(eq(schema.agentRun.id, run!.id));
    return parsed.data;
  } catch (error) {
    await db
      .update(schema.agentRun)
      .set({ status: "echoue", error: error instanceof Error ? error.message.slice(0, 500) : "Échec.", finishedAt: new Date() })
      .where(eq(schema.agentRun.id, run!.id));
    throw error;
  }
}
