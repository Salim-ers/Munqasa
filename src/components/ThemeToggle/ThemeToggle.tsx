import { Moon, Sun } from "lucide-react";
import { useAppState } from "../AppState";
import "./ThemeToggle.css";

/**
 * Sélecteur de lumière : un rectangle encadré de terracotta, deux positions.
 * La position active est un aplat terracotta qui glisse de Jour à Nuit.
 * Les libellés peuvent être masqués visuellement (icônes seules) : ils restent
 * le nom accessible des boutons.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { mode, switchMode } = useAppState();

  return (
    <div className={["theme-toggle", `theme-toggle--${mode}`, className].filter(Boolean).join(" ")} role="group" aria-label="Lumière du site">
      <span className="theme-toggle__thumb" aria-hidden="true" />
      <button type="button" className="theme-toggle__btn" aria-pressed={mode === "day"} onClick={() => switchMode("day")}>
        <Sun size={16} strokeWidth={1.75} aria-hidden="true" />
        <span className="theme-toggle__text">Jour</span>
      </button>
      <button type="button" className="theme-toggle__btn" aria-pressed={mode === "night"} onClick={() => switchMode("night")}>
        <Moon size={16} strokeWidth={1.75} aria-hidden="true" />
        <span className="theme-toggle__text">Nuit</span>
      </button>
    </div>
  );
}
