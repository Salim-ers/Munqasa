import { useEffect, useRef, useState } from "react";
import { gsap } from "../../animations/gsap";
import { useFinePointer, useReducedMotion } from "../../hooks/useMediaQuery";
import "./Cursor.css";

type CursorState = { kind: "default" } | { kind: "label"; text: string } | { kind: "cta" };

const LABELS: Record<string, string> = { voir: "Voir", ouvrir: "Ouvrir" };

/**
 * Curseur desktop : un point terracotta. « Voir » sur les images, « Ouvrir »
 * sur les services, léger agrandissement sur les boutons. Absent sur écran
 * tactile et avec prefers-reduced-motion.
 */
export function Cursor() {
  const fine = useFinePointer();
  const reduced = useReducedMotion();
  const enabled = fine && !reduced;
  const dot = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<CursorState>({ kind: "default" });
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    const el = dot.current;
    if (!enabled || !el) return;
    document.documentElement.classList.add("has-cursor");
    const x = gsap.quickTo(el, "x", { duration: 0.35, ease: "power3.out" });
    const y = gsap.quickTo(el, "y", { duration: 0.35, ease: "power3.out" });

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      x(e.clientX);
      y(e.clientY);
      setHidden(false);
    };
    const onOver = (e: PointerEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest("input, textarea, select")) {
        setHidden(true);
        return;
      }
      const hit = target?.closest<HTMLElement>("[data-cursor]");
      const kind = hit?.dataset.cursor;
      if (kind === "cta") setState({ kind: "cta" });
      else if (kind && LABELS[kind]) setState({ kind: "label", text: LABELS[kind] });
      else setState({ kind: "default" });
    };
    const onLeave = () => setHidden(true);

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerover", onOver, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      document.documentElement.classList.remove("has-cursor");
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerover", onOver);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      ref={dot}
      className={["cursor", `cursor--${state.kind}`, hidden ? "is-hidden" : ""].filter(Boolean).join(" ")}
      aria-hidden="true"
    >
      <span className="cursor__label label">{state.kind === "label" ? state.text : ""}</span>
    </div>
  );
}
