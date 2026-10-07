import { createContext, use, useMemo, useState, type ReactNode } from "react";
import { readStorage } from "../lib/storage";

export type LightMode = "day" | "night";

interface AppState {
  /** Le loader est terminé (ou n'a pas lieu) : les animations d'entrée peuvent démarrer. */
  introDone: boolean;
  setIntroDone: (done: boolean) => void;
  /** Lumière du hero, mémorisée par visiteur. */
  heroMode: LightMode;
  setHeroMode: (mode: LightMode) => void;
}

const Ctx = createContext<AppState | null>(null);

export const LOADER_SEEN_KEY = "munaqasa:intro";
export const HERO_MODE_KEY = "munaqasa:light";

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [introDone, setIntroDone] = useState(() => readStorage("session", LOADER_SEEN_KEY) === "1");
  const [heroMode, setHeroMode] = useState<LightMode>(() => (readStorage("local", HERO_MODE_KEY) === "night" ? "night" : "day"));
  const value = useMemo(() => ({ introDone, setIntroDone, heroMode, setHeroMode }), [introDone, heroMode]);
  return <Ctx value={value}>{children}</Ctx>;
}

export function useAppState(): AppState {
  const ctx = use(Ctx);
  if (!ctx) throw new Error("useAppState doit être utilisé dans <AppStateProvider>.");
  return ctx;
}
