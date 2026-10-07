/**
 * Accès au stockage navigateur tolérant aux erreurs (navigation privée,
 * stockage bloqué) : le site fonctionne à l'identique sans lui.
 */
export function readStorage(store: "local" | "session", key: string): string | null {
  try {
    return (store === "local" ? window.localStorage : window.sessionStorage).getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(store: "local" | "session", key: string, value: string) {
  try {
    (store === "local" ? window.localStorage : window.sessionStorage).setItem(key, value);
  } catch {
    /* stockage indisponible : préférence non mémorisée */
  }
}
