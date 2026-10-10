/**
 * Instantanés des sources publiques (server/data/prix/<source>.json.gz) : références déjà lues et
 * contrôlées, avec l'adresse et l'empreinte de chaque ressource officielle à la date de lecture.
 * Ils permettent un premier chargement sans dépendre de la disponibilité des sites des producteurs ;
 * l'actualisation relit ensuite les ressources en ligne.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import type { SourceRecord, SourceResource } from "../../../shared/prices.js";

export interface Snapshot {
  sourceKey: string;
  generatedAt: string;
  resources: SourceResource[];
  records: SourceRecord[];
}

const directory = () => join(process.cwd(), "server", "data", "prix");

export const snapshotPath = (key: string) => join(directory(), `${key}.json.gz`);

export function readSnapshot(key: string): Snapshot | null {
  const path = snapshotPath(key);
  if (!existsSync(path)) return null;
  return JSON.parse(gunzipSync(readFileSync(path)).toString("utf-8")) as Snapshot;
}

export function writeSnapshot(snapshot: Snapshot): string {
  mkdirSync(directory(), { recursive: true });
  const path = snapshotPath(snapshot.sourceKey);
  writeFileSync(path, gzipSync(Buffer.from(JSON.stringify(snapshot), "utf-8"), { level: 9 }));
  return path;
}
