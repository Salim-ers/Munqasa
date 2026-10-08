import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import { EASE, gsap } from "../../animations/gsap";
import { CONTACT, NAV } from "../../data/navigation";
import { useReducedMotion } from "../../hooks/useMediaQuery";
import { lockScroll, unlockScroll } from "../../lib/scroll";
import { CtaLink } from "../CtaLink/CtaLink";
import { LogoSymbol } from "../Logo/Logo";
import { TransitionLink } from "../TransitionLink/TransitionLink";
import "./MobileMenu.css";

interface MobileMenuProps {
  open: boolean;
  onClose: () => void;
}

/** Menu plein écran : grande typographie numérotée, arche du logo en filigrane. */
export function MobileMenu({ open, onClose }: MobileMenuProps) {
  const { pathname } = useLocation();
  const reduced = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(open);

  if (open && !mounted) setMounted(true);

  // Ouverture / fermeture animées.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || !mounted) return;
    const items = el.querySelectorAll(".menu__item-inner, .menu__foot");
    const ctx = gsap.context(() => {
      if (open) {
        gsap.set(el, { visibility: "visible" });
        if (reduced) {
          gsap.fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.25 });
          return;
        }
        gsap
          .timeline()
          .fromTo(el, { clipPath: "inset(0% 0% 100% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.7, ease: EASE.architect })
          .fromTo(items, { yPercent: 110 }, { yPercent: 0, duration: 0.9, ease: EASE.premium, stagger: 0.05 }, 0.25);
      } else {
        gsap
          .timeline({ onComplete: () => setMounted(false) })
          .to(el, reduced ? { autoAlpha: 0, duration: 0.2 } : { clipPath: "inset(0% 0% 100% 0%)", duration: 0.5, ease: EASE.architect });
      }
    }, el);
    return () => ctx.revert();
  }, [open, mounted, reduced]);

  // Défilement bloqué, Échap pour fermer, focus piégé dans le menu.
  useEffect(() => {
    if (!open) return;
    const el = root.current;
    const opener = document.activeElement as HTMLElement | null;
    lockScroll();
    el?.querySelector<HTMLElement>("a")?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !el) return;
      const focusables = [
        ...document.querySelectorAll<HTMLElement>(".header__toggle"),
        ...el.querySelectorAll<HTMLElement>("a[href], button"),
      ];
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      unlockScroll();
      opener?.focus({ preventScroll: true });
    };
  }, [open, onClose]);

  if (!mounted) return null;

  return (
    <div
      ref={root}
      id="menu-mobile"
      className="menu tone-1"
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      data-lenis-prevent
    >
      <LogoSymbol className="menu__arch" />
      <nav className="menu__nav" aria-label="Navigation mobile">
        <ol>
          {NAV.map((item) => (
            <li key={item.to} className="menu__item">
              <span className="menu__item-inner">
                <TransitionLink
                  to={item.to}
                  className="menu__link"
                  aria-current={pathname === item.to ? "page" : undefined}
                  onClick={onClose}
                >
                  <span className="menu__label">{item.label}</span>
                </TransitionLink>
              </span>
            </li>
          ))}
        </ol>
      </nav>
      <div className="menu__foot-wrap">
        <div className="menu__foot">
          <CtaLink to={CONTACT.to}>{CONTACT.label}</CtaLink>
        </div>
      </div>
      <button type="button" className="skip-link" onClick={onClose}>
        Fermer le menu
      </button>
    </div>
  );
}
