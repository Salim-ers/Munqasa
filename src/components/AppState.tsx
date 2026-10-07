import { createContext, use, useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { readStorage, writeStorage } from "../lib/storage";

export type LightMode = "day" | "night";

interface AppState {
  /** Le loader est terminé (ou n'a pas lieu) : les animations d'entrée peuvent démarrer. */
  introDone: boolean;
  setIntroDone: (done: boolean) => void;
  /** Lumière de tout le site, mémorisée par visiteur. */
  mode: LightMode;
  /** Change la lumière : la nouvelle balaie la page de gauche à droite. */
  switchMode: (mode: LightMode) => void;
}

const Ctx = createContext<AppState | null>(null);

export const LOADER_SEEN_KEY = "munaqasa:intro";
export const LIGHT_KEY = "munaqasa:light";

/** Photos de la lumière demandée visibles à l'écran : chargées avant le balayage. */
async function preloadVisible(mode: LightMode) {
  const root = document.documentElement;
  root.dataset.themePreload = mode;
  const imgs = [...document.querySelectorAll<HTMLImageElement>(`.tpic__${mode} img`)].filter((img) => {
    const r = img.getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight && r.width > 0;
  });
  await Promise.race([
    Promise.all(imgs.map((img) => img.decode().catch(() => undefined))),
    new Promise((resolve) => setTimeout(resolve, 1500)),
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
      const apply = () => {
        flushSync(() => setMode(next));
        document.documentElement.dataset.theme = next;
        writeStorage("local", LIGHT_KEY, next);
      };
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      try {
        if (reduced || typeof document.startViewTransition !== "function") {
          apply();
        } else {
          await preloadVisible(next);
          await document.startViewTransition(apply).finished;
        }
      } finally {
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
