/**
 * Stockage des fichiers privés (plans, documents sources, exports).
 * - Production : compartiment compatible S3 (Cloudflare R2), privé. Les navigateurs téléversent et
 *   téléchargent directement avec des URL signées de courte durée : les fichiers ne transitent pas
 *   par les fonctions Vercel (limitées à 4,5 Mo par requête).
 * - Développement : dossier local (.data/storage), servi par l'API après contrôle de la session.
 * Les fichiers ne sont jamais placés dans public/.
 */
import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { open, rm, writeFile } from "node:fs/promises";
import { dirname, join, normalize, resolve } from "node:path";
import { Readable } from "node:stream";
import { getEnv } from "../env.js";

/** Durée de validité des URL signées. */
const UPLOAD_URL_SECONDS = 15 * 60;
const DOWNLOAD_URL_SECONDS = 5 * 60;

export interface StorageDriver {
  readonly kind: "s3" | "local";
  /** URL de téléversement direct (S3) ; null en local (l'API reçoit le fichier). */
  uploadUrl(key: string, contentType: string): Promise<string | null>;
  /** URL de téléchargement temporaire (S3) ; null en local (l'API sert le fichier). */
  downloadUrl(key: string, fileName: string, inline?: boolean): Promise<string | null>;
  head(key: string): Promise<{ size: number } | null>;
  /** Premiers octets du fichier (vérification du type réel). */
  readStart(key: string, length: number): Promise<Uint8Array>;
  readStream(key: string): Promise<ReadableStream<Uint8Array>>;
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  remove(key: string): Promise<void>;
}

function contentDisposition(fileName: string, inline: boolean): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/**
 * Client S3 pour R2. Les sommes de contrôle ne sont calculées que si l'opération l'exige : par défaut, le
 * kit AWS signe dans l'URL de téléversement la somme d'un corps vide, et R2 refuserait tout fichier réel.
 */
export function s3ClientOptions(env: Pick<ReturnType<typeof getEnv>, "S3_REGION" | "S3_ENDPOINT" | "S3_ACCESS_KEY_ID" | "S3_SECRET_ACCESS_KEY">) {
  return {
    region: env.S3_REGION ?? "auto",
    endpoint: env.S3_ENDPOINT,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID!, secretAccessKey: env.S3_SECRET_ACCESS_KEY! },
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED" as const,
    responseChecksumValidation: "WHEN_REQUIRED" as const,
  };
}

async function createS3Driver(): Promise<StorageDriver> {
  const env = getEnv();
  const { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  const client = new S3Client(s3ClientOptions(env));
  const Bucket = env.S3_BUCKET!;
  return {
    kind: "s3",
    uploadUrl: (key, contentType) => getSignedUrl(client, new PutObjectCommand({ Bucket, Key: key, ContentType: contentType }), { expiresIn: UPLOAD_URL_SECONDS }),
    downloadUrl: (key, fileName, inline = false) =>
      getSignedUrl(client, new GetObjectCommand({ Bucket, Key: key, ResponseContentDisposition: contentDisposition(fileName, inline) }), { expiresIn: DOWNLOAD_URL_SECONDS }),
    async head(key) {
      try {
        const res = await client.send(new HeadObjectCommand({ Bucket, Key: key }));
        return { size: Number(res.ContentLength ?? 0) };
      } catch {
        return null;
      }
    },
    async readStart(key, length) {
      const res = await client.send(new GetObjectCommand({ Bucket, Key: key, Range: `bytes=0-${length - 1}` }));
      return new Uint8Array(await res.Body!.transformToByteArray());
    },
    async readStream(key) {
      const res = await client.send(new GetObjectCommand({ Bucket, Key: key }));
      return res.Body!.transformToWebStream() as ReadableStream<Uint8Array>;
    },
    async put(key, body, contentType) {
      await client.send(new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType }));
    },
    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },
  };
}

function createLocalDriver(root: string): StorageDriver {
  const base = resolve(root);
  mkdirSync(base, { recursive: true });
  /** Chemin confiné au dossier de stockage (aucune remontée « ../ »). */
  const pathOf = (key: string) => {
    const full = normalize(join(base, key));
    if (!full.startsWith(base)) throw new Error("Clé de stockage invalide.");
    return full;
  };
  return {
    kind: "local",
    uploadUrl: async () => null,
    downloadUrl: async () => null,
    async head(key) {
      const full = pathOf(key);
      return existsSync(full) ? { size: statSync(full).size } : null;
    },
    async readStart(key, length) {
      const handle = await open(pathOf(key), "r");
      try {
        const buffer = Buffer.alloc(length);
        const { bytesRead } = await handle.read(buffer, 0, length, 0);
        return new Uint8Array(buffer.subarray(0, bytesRead));
      } finally {
        await handle.close();
      }
    },
    async readStream(key) {
      return Readable.toWeb(createReadStream(pathOf(key))) as ReadableStream<Uint8Array>;
    },
    async put(key, body) {
      const full = pathOf(key);
      mkdirSync(dirname(full), { recursive: true });
      await writeFile(full, body);
    },
    async remove(key) {
      await rm(pathOf(key), { force: true });
    },
  };
}

let driver: Promise<StorageDriver> | null = null;

export function storageConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.S3_ENDPOINT && env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY);
}

export function getStorage(): Promise<StorageDriver> {
  driver ??= (async () => {
    const env = getEnv();
    if (storageConfigured()) return createS3Driver();
    if (env.isProduction) throw new StorageNotConfiguredError();
    return createLocalDriver(env.LOCAL_STORAGE_DIR ?? ".data/storage");
  })().catch((error: unknown) => {
    driver = null;
    throw error;
  });
  return driver;
}

export class StorageNotConfiguredError extends Error {
  constructor() {
    super("Stockage des fichiers non configuré (variables S3_*).");
  }
}

/** Tests : réinitialise le pilote. */
export function resetStorageForTests(): void {
  driver = null;
}

/** Clé de stockage : préfixe par affaire, identifiant unique, nom assaini (jamais le nom brut seul). */
export function storageKey(projectId: string | null, fileId: string, fileName: string): string {
  const safe = fileName
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(-120);
  return `${projectId ? `affaires/${projectId}` : "bibliotheque"}/${fileId}/${safe}`;
}
