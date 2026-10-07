import { useLayoutEffect, useRef } from "react";
import { EASE, gsap, MEDIA } from "../../animations/gsap";
import { HERO_MODE_KEY, useAppState, type LightMode } from "../../components/AppState";
import { CtaLink } from "../../components/CtaLink/CtaLink";
import { Tag } from "../../components/Tag/Tag";
import { HERO } from "../../data/photos";
import { useGsap } from "../../hooks/useGsap";
import { useReducedMotion } from "../../hooks/useMediaQuery";
import { writeStorage } from "../../lib/storage";
import "./Hero.css";

const srcSet = (mode: LightMode) => HERO.widths.map((w) => `${HERO.src(mode, w)} ${w}w`).join(", ");

function HeroImage({ mode }: { mode: LightMode }) {
  return (
    <img
      className="hero__img"
      src={HERO.src(mode, 1920)}
      srcSet={srcSet(mode)}
      sizes="100vw"
      width={HERO.width}
      height={HERO.height}
      alt={HERO.alt[mode]}
      loading="eager"
      decoding={mode === "day" ? "sync" : "async"}
      fetchPriority={mode === "day" ? "high" : "low"}
    />
  );
}

/** Volet jour ↔ nuit : toujours balayé de gauche à droite, comme le temps qui passe. */
const CLIP = {
  hiddenLeft: "inset(0% 100% 0% 0%)",
  hiddenRight: "inset(0% 0% 0% 100%)",
  full: "inset(0% 0% 0% 0%)",
};

export function Hero() {
  const { heroMode, setHeroMode, introDone } = useAppState();
  const reduced = useReducedMotion();
  const root = useRef<HTMLElement>(null);
  const nightLayer = useRef<HTMLDivElement>(null);
  const seam = useRef<HTMLSpanElement>(null);
  const previousMode = useRef(heroMode);

  function choose(mode: LightMode) {
    if (mode === heroMode) return;
    setHeroMode(mode);
    writeStorage("local", HERO_MODE_KEY, mode);
  }

  // Transition jour / nuit : même bâtiment, même cadrage — seule la lumière change.
  useLayoutEffect(() => {
    const layer = nightLayer.current;
    const line = seam.current;
    if (!layer || !line) return;
    const toNight = heroMode === "night";

    if (previousMode.current === heroMode) {
      gsap.set(layer, { clipPath: toNight ? CLIP.full : CLIP.hiddenLeft });
      return;
    }
    previousMode.current = heroMode;

    const tl = gsap.timeline();
    if (reduced) {
      tl.fromTo(layer, { clipPath: CLIP.full, autoAlpha: toNight ? 0 : 1 }, { autoAlpha: toNight ? 1 : 0, duration: 0.45, ease: EASE.linear }).set(layer, {
        autoAlpha: 1,
        clipPath: toNight ? CLIP.full : CLIP.hiddenLeft,
      });
      return () => {
        tl.kill();
      };
    }

    const incoming = (toNight ? layer : root.current?.querySelector(".hero__layer--day"))?.querySelector("img");
    tl.set(line, { left: "0%", autoAlpha: 1 })
      .fromTo(
        layer,
        { clipPath: toNight ? CLIP.hiddenLeft : CLIP.full },
        { clipPath: toNight ? CLIP.full : CLIP.hiddenRight, duration: 1.25, ease: EASE.architect },
        0,
      )
      .to(line, { left: "100%", duration: 1.25, ease: EASE.architect }, 0)
      .to(line, { autoAlpha: 0, duration: 0.25 }, 1.05);
    if (incoming) tl.fromTo(incoming, { scale: 1.05 }, { scale: 1, duration: 1.6, ease: EASE.premium }, 0);
    tl.set(layer, { clipPath: toNight ? CLIP.full : CLIP.hiddenLeft });

    return () => {
      tl.progress(1).kill();
    };
  }, [heroMode, reduced]);

  // Entrée (après le loader) et parallaxe légère au défilement.
  useGsap(
    ({ reduced: rm, scope }) => {
      const q = gsap.utils.selector(scope);
      if (!introDone) {
        gsap.set(q(".hero__line-inner"), { yPercent: 110 });
        gsap.set(q(".hero__fade"), { autoAlpha: 0 });
        return;
      }
      if (rm) {
        gsap.fromTo(q(".hero__fade, .hero__line-inner"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6 });
      } else {
        gsap
          .timeline()
          .fromTo(q(".hero__media"), { scale: 1.08 }, { scale: 1, duration: 2.2, ease: EASE.premium }, 0)
          .fromTo(q(".blueprint-grid > span"), { scaleY: 0 }, { scaleY: 1, duration: 1.4, ease: EASE.architect, stagger: 0.04, transformOrigin: "50% 0%" }, 0)
          .fromTo(q(".hero__line-inner"), { yPercent: 110 }, { yPercent: 0, duration: 1.3, ease: EASE.premium, stagger: 0.12 }, 0.15)
          .fromTo(q(".hero__fade"), { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 1, ease: EASE.premium, stagger: 0.07 }, 0.55);
      }

      const mm = gsap.matchMedia();
      mm.add(MEDIA.desktop, () => {
        gsap.to(q(".hero__media"), {
          yPercent: 10,
          ease: EASE.linear,
          scrollTrigger: { trigger: scope, start: "top top", end: "bottom top", scrub: true },
        });
        gsap.to(q(".hero__content"), {
          yPercent: -12,
          autoAlpha: 0.2,
          ease: EASE.linear,
          scrollTrigger: { trigger: scope, start: "35% top", end: "bottom top", scrub: true },
        });
      });
    },
    root,
    [introDone],
  );

  return (
    <section
      ref={root}
      className="hero"
      data-mode={heroMode}
      data-surface={heroMode === "night" ? "dark" : "light"}
      aria-labelledby="hero-title"
    >
      <div className="hero__media-wrap">
        <div className="hero__media">
          <div className="hero__layer hero__layer--day">
            <HeroImage mode="day" />
          </div>
          <div ref={nightLayer} className="hero__layer hero__layer--night">
            <HeroImage mode="night" />
          </div>
        </div>
        <div className="hero__scrim" />
        <span ref={seam} className="hero__seam" aria-hidden="true" />
      </div>

      <div className="blueprint-grid hero__grid" aria-hidden="true">
        {Array.from({ length: 12 }, (_, i) => (
          <span key={i} />
        ))}
      </div>

      <div className="hero__frame">
        <div className="hero__top hero__fade">
          <Tag dot>Appels d’offres · Maroc</Tag>
          <span className="label hero__ref">Dossier / 01</span>
        </div>

        <p className="hero__vertical label hero__fade" aria-hidden="true">
          AO / Consultation
        </p>

        <div className="hero__content">
          <h1 id="hero-title" className="hero__title display-xl">
            <span className="hero__line">
              <span className="hero__line-inner">De l’avis</span>
            </span>
            <span className="hero__line">
              <span className="hero__line-inner">
                à la <em>soumission.</em>
              </span>
            </span>
          </h1>
          <p className="hero__lead hero__fade">
            MUNAQASA accompagne les entreprises dans l’identification, l’analyse, la préparation et le suivi de leurs appels
            d’offres.
          </p>
          <div className="hero__actions hero__fade">
            <CtaLink to="/contact">Confier un dossier</CtaLink>
            <CtaLink to="/methode" variant="text" arrow="right">
              Découvrir notre méthode
            </CtaLink>
          </div>
        </div>

        <div className="hero__bar hero__fade">
          <div className="daynight" role="group" aria-label="Lumière de la photographie">
            <button type="button" className="daynight__btn label" aria-pressed={heroMode === "day"} onClick={() => choose("day")}>
              Jour
            </button>
            <span className="daynight__track" aria-hidden="true">
              <i />
            </span>
            <button type="button" className="daynight__btn label" aria-pressed={heroMode === "night"} onClick={() => choose("night")}>
              Nuit
            </button>
          </div>
          <span className="hero__scroll label" aria-hidden="true">
            <i />
            Défiler
          </span>
          <span className="label hero__place">Maroc</span>
        </div>
      </div>
    </section>
  );
}
