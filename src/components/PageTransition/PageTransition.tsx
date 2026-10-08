import { createContext, use, useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { EASE, gsap } from "../../animations/gsap";
import { routeMeta } from "../../data/routes";
import { useReducedMotion } from "../../hooks/useMediaQuery";
import { scrollToElement, scrollToTop } from "../../lib/scroll";
import "./PageTransition.css";

interface TransitionApi {
  go: (to: string) => void;
}

const Ctx = createContext<TransitionApi | null>(null);

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/**
 * Transition entre pages : un panneau terracotta traverse l'écran avec le nom
 * de la destination, la route change sous le panneau, puis il se retire.
 * ≈ 750 ms au total. Retour/avance du navigateur : pas de panneau.
 */
export function PageTransitionProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const reduced = useReducedMotion();
  const panel = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const [label, setLabel] = useState("");

  const go = useCallback(
    async (to: string) => {
      const [path = "/", hash] = to.split("#");
      if (busy.current) return;
      if (path === pathname) {
        const target = hash ? document.getElementById(hash) : null;
        if (target) scrollToElement(target);
        else scrollToTop({ smooth: !reduced });
        return;
      }
      const el = panel.current;
      if (reduced || !el) {
        await navigate(to);
        return;
      }

      busy.current = true;
      setLabel(routeMeta(path)?.label ?? "");
      const text = el.querySelector(".page-transition__label");
      gsap.set(el, { visibility: "visible", clipPath: "inset(0% 100% 0% 0%)" });
      await gsap
        .timeline()
        .to(el, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.38, ease: EASE.architect })
        .fromTo(text, { yPercent: 40, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 0.3, ease: EASE.out }, 0.14)
        .then();

      await navigate(to);
      if (!hash) scrollToTop();
      await nextFrame();
      await nextFrame();

      await gsap
        .timeline()
        .to(text, { autoAlpha: 0, duration: 0.18, ease: EASE.linear })
        .to(el, { clipPath: "inset(0% 0% 0% 100%)", duration: 0.42, ease: EASE.architect }, 0.04)
        .then();
      gsap.set(el, { visibility: "hidden" });
      busy.current = false;
    },
    [navigate, pathname, reduced],
  );

  const api = useMemo(() => ({ go }), [go]);

  return (
    <Ctx value={api}>
      {children}
      <div ref={panel} className="page-transition" aria-hidden="true">
        <div className="page-transition__label">
          <span className="label">Talab Solutions</span>
          <span className="page-transition__title">{label}</span>
        </div>
      </div>
    </Ctx>
  );
}

export function usePageTransition(): TransitionApi {
  const ctx = use(Ctx);
  if (!ctx) throw new Error("usePageTransition doit être utilisé dans <PageTransitionProvider>.");
  return ctx;
}
