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
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const res = await fetch(`/api/admin${path}`, {
    method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
    credentials: "same-origin",
    headers: init.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: init.signal,
  });
  const data = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
  if (!res.ok) {
    const error = new ApiError(res.status, data?.error ?? "erreur", data?.message ?? "Une erreur est survenue.");
    // /me est traité par la garde et la page de connexion elles-mêmes (sinon : boucle de rechargement).
    if (res.status === 401 && path !== "/me") window.dispatchEvent(new CustomEvent("talab:unauthenticated"));
    if (res.status === 403 && error.code === "second_facteur_requis") window.dispatchEvent(new CustomEvent("talab:second-factor-required"));
    throw error;
  }
  return data as T;
}
