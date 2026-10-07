import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import { AppStateProvider } from "./components/AppState";
import { router } from "./router";
import "./styles/index.css";

const container = document.getElementById("root");
if (!container) throw new Error("#root introuvable");

createRoot(container).render(
  <StrictMode>
    <AppStateProvider>
      <RouterProvider router={router} />
    </AppStateProvider>
  </StrictMode>,
);
