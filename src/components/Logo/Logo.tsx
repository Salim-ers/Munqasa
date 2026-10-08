import { useAppState, type LightMode } from "../AppState";
import "./Logo.css";

const LIGHTS: LightMode[] = ["day", "night"];

/**
 * Logo Talab Solutions — fichiers fournis, jamais redessinés.
 * Jour : noir et terracotta ; nuit : noir, blanc et or. Même lettrage, mêmes dimensions :
 * seule la version de la lumière active est affichée et téléchargée, l'autre l'est juste
 * avant le changement de lumière (voir AppState).
 */
export function Logo({ className }: { className?: string }) {
  const { mode } = useAppState();

  return (
    <span className={["logo", className].filter(Boolean).join(" ")} role="img" aria-label="Talab Solutions">
      {LIGHTS.map((light) => {
        const loading = light === mode ? "eager" : "lazy";
        return (
          <span key={light} className={`logo__set tpic__${light}`}>
            <img className="logo__symbol" src={`/logos/talab-${light}-symbol-sm.webp`} width={360} height={228} alt="" loading={loading} />
            <img className="logo__wordmark" src={`/logos/talab-${light}-wordmark-sm.webp`} width={640} height={188} alt="" loading={loading} />
          </span>
        );
      })}
    </span>
  );
}

/** Symbole du logo dans la lumière active, pour les filigranes : le fichier est déjà chargé par l'en-tête. */
export function LogoSymbol({ className }: { className: string }) {
  const { mode } = useAppState();
  return <img className={className} src={`/logos/talab-${mode}-symbol-sm.webp`} width={360} height={228} alt="" />;
}
