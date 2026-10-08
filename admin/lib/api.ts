/**
 * Client de l'API d'administration : JSON, cookies de session (même origine), erreurs typées.
 * Une session absente ou expirée renvoie vers la connexion ; une double authentification
 * non activée renvoie vers son activation.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** Erreurs de validation, par champ. */
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

type ErrorBody = { error?: string; message?: string; fields?: Record<string, string> } | null;

function raise(status: number, data: ErrorBody, path: string): never {
  const error = new ApiError(status, data?.error ?? "erreur", data?.message ?? "Une erreur est survenue.", data?.fields ?? {});
  // /me est traité par la garde et la page de connexion elles-mêmes (sinon : boucle de rechargement).
  if (status === 401 && path !== "/me") window.dispatchEvent(new CustomEvent("talab:unauthenticated"));
  if (status === 403 && error.code === "second_facteur_requis") window.dispatchEvent(new CustomEvent("talab:second-factor-required"));
  throw error;
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const res = await fetch(`/api/admin${path}`, {
    method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
    credentials: "same-origin",
    headers: init.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: init.signal,
  });
  const data = (await res.json().catch(() => null)) as ErrorBody;
  if (!res.ok) raise(res.status, data, path);
  return data as T;
}

/** Chaîne de requête sans les valeurs vides. */
export function query(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "" || value === false) continue;
    search.set(key, value === true ? "1" : String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

/**
 * Envoi d'un fichier avec suivi de progression (fetch ne le permet pas encore partout).
 * En production, l'envoi part directement vers le compartiment privé, avec une URL signée.
 */
export function sendFile(
  target: { method: string; url: string; headers: Record<string, string> },
  file: Blob,
  onProgress: (ratio: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(target.method, target.url);
    for (const [key, value] of Object.entries(target.headers)) xhr.setRequestHeader(key, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let data: ErrorBody = null;
      try {
        data = JSON.parse(xhr.responseText) as ErrorBody;
      } catch {
        /* réponse du stockage, non JSON */
      }
      reject(new ApiError(xhr.status, data?.error ?? "envoi_echoue", data?.message ?? "Le stockage a refusé l’envoi."));
    };
    xhr.onerror = () => reject(new ApiError(0, "reseau", "La connexion a été interrompue pendant l’envoi."));
    xhr.onabort = () => reject(new DOMException("Envoi annulé.", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

/** Message lisible pour une erreur quelconque. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof DOMException && error.name === "AbortError") return "Opération annulée.";
  return "Une erreur est survenue.";
}
