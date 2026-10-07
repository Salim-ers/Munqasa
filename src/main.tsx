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

const container = document.getElementById("root");
if (!container) throw new Error("#root introuvable");

createRoot(container).render(
  <StrictMode>
    <AppStateProvider>
      <RouterProvider router={router} />
    </AppStateProvider>
  </StrictMode>,
);
