import type { ComponentType } from "react";
import { createBrowserRouter } from "react-router";
import { RootLayout } from "./components/RootLayout";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";

/** Accueil chargé immédiatement ; les autres pages à la demande. */
const page = (load: () => Promise<{ default: ComponentType }>) => async () => ({ Component: (await load()).default });

export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    hydrateFallbackElement: <div className="boot" />,
    children: [
      { index: true, element: <Home /> },
      { path: "services", lazy: page(() => import("./pages/Services")) },
      { path: "methode", lazy: page(() => import("./pages/Methode")) },
      { path: "expertise", lazy: page(() => import("./pages/Expertise")) },
      { path: "contact", lazy: page(() => import("./pages/Contact")) },
      { path: "mentions-legales", lazy: page(() => import("./pages/MentionsLegales")) },
      { path: "politique-confidentialite", lazy: page(() => import("./pages/PolitiqueConfidentialite")) },
      { path: "*", element: <NotFound /> },
    ],
  },
]);
