/**
 * Lumière jour / nuit, partagée avec la vitrine (même clé de stockage, appliquée avant le premier
 * rendu par /theme-init.js). Jour : terracotta ; nuit : or.
 */
import { useSyncExternalStore } from "react";

export type Light = "day" | "night";
const KEY = "talab:light";
const EVENT = "talab:light-change";

function read(): Light {
  return document.documentElement.dataset.theme === "night" ? "night" : "day";
}

export function setLight(next: Light): void {
  const root = document.documentElement;
  const apply = () => {
    root.dataset.theme = next;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", next === "night" ? "#0B0C0D" : "#F4F1EC");
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* stockage indisponible : la lumière vaut pour cette page */
    }
    window.dispatchEvent(new Event(EVENT));
  };
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduced && typeof document.startViewTransition === "function") document.startViewTransition(apply);
  else apply();
}

export function useLight(): Light {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener(EVENT, onChange);
      window.addEventListener("storage", onChange);
      return () => {
        window.removeEventListener(EVENT, onChange);
        window.removeEventListener("storage", onChange);
      };
    },
    read,
    () => "day",
  );
}
