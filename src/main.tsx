import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import { AppStateProvider } from "./components/AppState";
import { SCROLL_POSITIONS_KEY } from "./lib/scroll";
import { router } from "./router";
import "./styles/index.css";

// React Router donne la même clé à la première page de chaque chargement complet :
// sans ce nettoyage, une adresse tapée à la main hériterait du défilement de la page
// précédente. Rechargement et retour arrière gardent leur position.
const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
if (navigation?.type === "navigate") {
  try {
    sessionStorage.removeItem(SCROLL_POSITIONS_KEY);
  } catch {
    /* stockage indisponible : rien à nettoyer */
  }
}

// Après une mise à jour du site, une page chargée à la demande peut pointer vers un fichier
// remplacé : on charge une fois la page demandée en entier, avec la nouvelle version (pas de boucle).
const RELOAD_KEY = "talab:reloaded";
window.addEventListener("vite:preloadError", (event) => {
  try {
    if (sessionStorage.getItem(RELOAD_KEY)) return;
    sessionStorage.setItem(RELOAD_KEY, "1");
  } catch {
    return;
  }
  event.preventDefault();
  const next = router.state.navigation.location;
  window.location.assign(next ? `${next.pathname}${next.search}${next.hash}` : window.location.href);
});
// Le site tourne normalement : une prochaine mise à jour pourra de nouveau être récupérée ainsi.
window.setTimeout(() => {
  try {
    sessionStorage.removeItem(RELOAD_KEY);
  } catch {
    /* stockage indisponible */
  }
}, 5000);

const container = document.getElementById("root");
if (!container) throw new Error("#root introuvable");

createRoot(container).render(
  <StrictMode>
    <AppStateProvider>
      <RouterProvider router={router} />
    </AppStateProvider>
  </StrictMode>,
);
