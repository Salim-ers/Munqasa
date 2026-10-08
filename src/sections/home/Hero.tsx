import { useRef } from "react";
import { EASE, gsap, MEDIA, SCRUB } from "../../animations/gsap";
import { useAppState, type LightMode } from "../../components/AppState";
import { CtaLink } from "../../components/CtaLink/CtaLink";
import { Tag } from "../../components/Tag/Tag";
import { CONTACT, CTA_LABEL } from "../../data/navigation";
import { HERO } from "../../data/photos";
import { useGsap } from "../../hooks/useGsap";
import "./Hero.css";

const srcSet = (mode: LightMode) => HERO.widths.map((w) => `${HERO.src(mode, w)} ${w}w`).join(", ");

/** Même bâtiment, même cadrage : la lumière du site choisit la photographie. */
function HeroImage({ light, active }: { light: LightMode; active: boolean }) {
  return (
    <picture className={`tpic__${light}`}>
      <img
        className="hero__img"
        src={HERO.src(light, 1920)}
        srcSet={srcSet(light)}
        sizes="100vw"
        width={HERO.width}
        height={HERO.height}
        alt={HERO.alt[light]}
        loading={active ? "eager" : "lazy"}
        decoding={active ? "sync" : "async"}
        fetchPriority={active ? "high" : "low"}
      />
    </picture>
  );
}

export function Hero() {
  const { mode, introDone } = useAppState();
  const root = useRef<HTMLElement>(null);

  // Entrée (après le loader) et parallaxe légère au défilement.
  useGsap(
    ({ reduced, scope }) => {
      const q = gsap.utils.selector(scope);
      if (!introDone) {
        gsap.set(q(".hero__line-inner"), { yPercent: 125 });
        gsap.set(q(".hero__fade"), { autoAlpha: 0 });
        return;
      }
      if (reduced) {
        gsap.fromTo(q(".hero__fade, .hero__line-inner"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6 });
        return;
      }
      gsap
        .timeline()
        .fromTo(q(".hero__media"), { scale: 1.08 }, { scale: 1, duration: 2.2, ease: EASE.premium }, 0)
        .fromTo(q(".hero__line-inner"), { yPercent: 125 }, { yPercent: 0, duration: 1.3, ease: EASE.premium, stagger: 0.12 }, 0.15)
        .fromTo(q(".hero__fade"), { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 1, ease: EASE.premium, stagger: 0.08 }, 0.55);

      gsap.matchMedia().add(MEDIA.desktop, () => {
        gsap.to(q(".hero__media"), { yPercent: 10, ease: EASE.linear, scrollTrigger: { trigger: scope, start: "top top", end: "bottom top", scrub: SCRUB } });
        gsap.to(q(".hero__content"), {
          yPercent: -12,
          autoAlpha: 0.2,
          ease: EASE.linear,
          scrollTrigger: { trigger: scope, start: "35% top", end: "bottom top", scrub: SCRUB },
        });
      });
    },
    root,
    [introDone],
  );

  return (
    <section ref={root} className="hero" aria-labelledby="hero-title">
      <div className="hero__media-wrap">
        <div className="hero__media">
          <HeroImage light="day" active={mode === "day"} />
          <HeroImage light="night" active={mode === "night"} />
        </div>
        <div className="hero__scrim" />
      </div>

      <div className="hero__frame">
        <div className="hero__content">
          <Tag className="hero__fade">Appels d’offres au Maroc</Tag>
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
            Talab Solutions accompagne les entreprises dans l’identification, l’analyse, la préparation et le suivi de leurs appels
            d’offres.
          </p>
          <div className="hero__actions hero__fade">
            <CtaLink to={CONTACT.to}>{CTA_LABEL}</CtaLink>
            <CtaLink to="/methode" variant="text" arrow="right">
              Découvrir notre méthode
            </CtaLink>
          </div>
        </div>
        <span className="hero__scroll label hero__fade" aria-hidden="true">
          <i />
          Défiler
        </span>
      </div>
    </section>
  );
}
