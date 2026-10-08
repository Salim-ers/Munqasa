import { Moon, Sun } from "lucide-react";
import { useState } from "react";
import { useAppState, type LightMode } from "../AppState";
import "./ThemeToggle.css";

/**
 * Sélecteur de lumière : un rectangle encadré, deux positions.
 * La position active est un aplat qui glisse de Jour à Nuit dès le geste, pendant que la bascule
 * se prépare (photos de la nouvelle lumière). Les libellés peuvent être masqués visuellement
 * (icônes seules) : ils restent le nom accessible des boutons.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { mode, switchMode } = useAppState();
  const [asked, setAsked] = useState<LightMode | null>(null);
  const shown = asked ?? mode;

  // Une bascule à la fois : un second geste pendant qu'elle se prépare est ignoré.
  const choose = (next: LightMode) => {
    if (next === shown || asked) return;
    setAsked(next);
    void switchMode(next).finally(() => setAsked(null));
  };

  return (
    <div className={["theme-toggle", `theme-toggle--${shown}`, className].filter(Boolean).join(" ")} role="group" aria-label="Lumière du site">
      <span className="theme-toggle__thumb" aria-hidden="true" />
      <button type="button" className="theme-toggle__btn" aria-pressed={shown === "day"} onClick={() => choose("day")}>
        <Sun size={16} strokeWidth={1.75} aria-hidden="true" />
        <span className="theme-toggle__text">Jour</span>
      </button>
      <button type="button" className="theme-toggle__btn" aria-pressed={shown === "night"} onClick={() => choose("night")}>
        <Moon size={16} strokeWidth={1.75} aria-hidden="true" />
        <span className="theme-toggle__text">Nuit</span>
      </button>
    </div>
  );
}
