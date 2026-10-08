import { createContext, use, useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { hasNoHover } from "../lib/device";
import { readStorage, writeStorage } from "../lib/storage";

export type LightMode = "day" | "night";

interface AppState {
  /** Le loader est terminé (ou n'a pas lieu) : les animations d'entrée peuvent démarrer. */
  introDone: boolean;
  setIntroDone: (done: boolean) => void;
  /** Lumière de tout le site, mémorisée par visiteur. */
  mode: LightMode;
  /** Change la lumière : la nouvelle balaie la page (fondu sur écran tactile). */
  switchMode: (mode: LightMode) => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

export const LOADER_SEEN_KEY = "talab:intro";
export const LIGHT_KEY = "talab:light";

/** Durée du glissement du sélecteur (ThemeToggle.css) : la bascule démarre une fois le geste fini. */
const TOGGLE_MS = 400;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Photos et logo de la lumière demandée visibles à l'écran : chargés avant le changement (attente plafonnée). */
async function preloadVisible(mode: LightMode, maxWait: number) {
  const root = document.documentElement;
  root.dataset.themePreload = mode;
  const imgs = [...document.querySelectorAll<HTMLImageElement>(`.tpic__${mode} img`)].filter((img) => {
    const r = img.getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight && r.width > 0;
  });
  await Promise.race([
    Promise.all(imgs.map((img) => img.decode().catch(() => undefined))),
    wait(maxWait),
  ]);
  delete root.dataset.themePreload;
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [introDone, setIntroDone] = useState(() => readStorage("session", LOADER_SEEN_KEY) === "1");
  const [mode, setMode] = useState<LightMode>(() => (document.documentElement.dataset.theme === "night" ? "night" : "day"));
  const busy = useRef(false);

  const switchMode = useCallback(
    async (next: LightMode) => {
      if (next === mode || busy.current) return;
      busy.current = true;
      const root = document.documentElement;
      const apply = () => {
        // Transitions CSS coupées le temps de la bascule : la nouvelle lumière est peinte en une fois.
        root.classList.add("is-switching-light");
        flushSync(() => setMode(next));
        root.dataset.theme = next;
        document.querySelector('meta[name="theme-color"]')?.setAttribute("content", next === "night" ? "#0B0C0D" : "#F5F1E9");
        writeStorage("local", LIGHT_KEY, next);
      };
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      try {
        // Le sélecteur a déjà répondu au geste (ThemeToggle) : on attend la fin de son glissement et,
        // brièvement, les photos de la nouvelle lumière (moins longtemps sur écran tactile).
        await Promise.all([preloadVisible(next, hasNoHover() ? 800 : 1500), reduced ? undefined : wait(TOGGLE_MS)]);
        if (reduced || typeof document.startViewTransition !== "function") {
          apply();
        } else {
          await document.startViewTransition(apply).finished.catch(() => undefined);
        }
      } finally {
        requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("is-switching-light")));
        busy.current = false;
      }
    },
    [mode],
  );

  const value = useMemo(() => ({ introDone, setIntroDone, mode, switchMode }), [introDone, mode, switchMode]);
  return <Ctx value={value}>{children}</Ctx>;
}

export function useAppState(): AppState {
  const ctx = use(Ctx);
  if (!ctx) throw new Error("useAppState doit être utilisé dans <AppStateProvider>.");
  return ctx;
}
