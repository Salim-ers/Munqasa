/**
 * Téléchargement des ressources officielles d'une source : adresses fixées dans le catalogue (jamais
 * fournies par une requête), délai et taille bornés, empreinte SHA-256 pour détecter une mise à jour.
 */
import { createHash } from "node:crypto";
import type { SourceResource } from "../../../shared/prices.js";
import { RetriableStepError } from "../../jobs/types.js";
import type { FetchedResource, SourceDefinition } from "./catalog.js";

const TIMEOUT_MS = 90_000;
const MAX_BYTES = 60 * 1024 * 1024;

export async function fetchResources(def: SourceDefinition): Promise<{ files: FetchedResource[]; resources: SourceResource[] }> {
  const files: FetchedResource[] = [];
  const resources: SourceResource[] = [];
  for (const spec of def.resources) {
    let res: Response;
    try {
      res = await fetch(spec.url, { headers: { "user-agent": "TalabSolutions-bibliotheque/1.0", accept: "*/*" }, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "follow" });
    } catch (error) {
      throw new RetriableStepError(`Ressource injoignable : ${spec.title} (${error instanceof Error ? error.message : String(error)}).`);
    }
    if (res.status >= 500 || res.status === 429) throw new RetriableStepError(`Ressource momentanément indisponible : ${spec.title} (HTTP ${res.status}).`);
    if (!res.ok) throw new Error(`Ressource refusée par le producteur : ${spec.title} (HTTP ${res.status}).`);
    const length = Number(res.headers.get("content-length") ?? 0);
    if (length > MAX_BYTES) throw new Error(`Ressource trop volumineuse : ${spec.title}.`);
    const data = new Uint8Array(await res.arrayBuffer());
    if (data.byteLength > MAX_BYTES) throw new Error(`Ressource trop volumineuse : ${spec.title}.`);
    files.push({ ...spec, data });
    resources.push({ url: spec.url, title: spec.title, sha256: createHash("sha256").update(data).digest("hex"), size: data.byteLength, fetchedAt: new Date().toISOString() });
  }
  return { files, resources };
}
