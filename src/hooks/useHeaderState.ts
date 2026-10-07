import { useEffect, useState } from "react";

export type Surface = "light" | "dark";

/** Ligne de lecture : à cette hauteur, la section rencontrée colore l'en-tête. */
const PROBE_Y = 36;

/**
 * Lit la lumière de la section située sous l'en-tête (attribut data-surface,
 * l'élément le plus profond l'emporte) et l'état « compact » au défilement.
 */
export function useHeaderState(pathname: string) {
  const [surface, setSurface] = useState<Surface>("light");
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      let found: Surface = "light";
      document.querySelectorAll<HTMLElement>("[data-surface]").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.top <= PROBE_Y && r.bottom > PROBE_Y) found = el.dataset.surface === "dark" ? "dark" : "light";
      });
      setSurface(found);
      setCompact(window.scrollY > 24);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    // La page suivante peut se monter une image plus tard (chargement différé).
    const late = window.setTimeout(update, 120);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["data-surface"] });

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(late);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      observer.disconnect();
    };
  }, [pathname]);

  return { surface, compact };
}
