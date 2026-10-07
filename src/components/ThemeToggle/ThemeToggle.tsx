import { Moon, Sun } from "lucide-react";
import { useAppState } from "../AppState";
import "./ThemeToggle.css";

/** Sélecteur de lumière : « Jour / Nuit » en toutes lettres, ou une icône en version compacte. */
export function ThemeToggle({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { mode, switchMode } = useAppState();

  if (compact) {
    const next = mode === "day" ? "night" : "day";
    return (
      <button
        type="button"
        className={["theme-icon", className].filter(Boolean).join(" ")}
        onClick={() => switchMode(next)}
        aria-label={next === "night" ? "Passer le site en nuit" : "Passer le site en jour"}
      >
        {mode === "day" ? <Moon size={18} strokeWidth={1.5} aria-hidden="true" /> : <Sun size={18} strokeWidth={1.5} aria-hidden="true" />}
      </button>
    );
  }

  return (
    <div className={["theme-toggle", `theme-toggle--${mode}`, className].filter(Boolean).join(" ")} role="group" aria-label="Lumière du site">
      <button type="button" className="theme-toggle__btn label" aria-pressed={mode === "day"} onClick={() => switchMode("day")}>
        Jour
      </button>
      <button type="button" className="theme-toggle__btn label" aria-pressed={mode === "night"} onClick={() => switchMode("night")}>
        Nuit
      </button>
      <span className="theme-toggle__rule" aria-hidden="true" />
    </div>
  );
}
