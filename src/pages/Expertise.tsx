import { useRef, type CSSProperties } from "react";
import { EASE, gsap, MEDIA, ScrollTrigger } from "../animations/gsap";
import { Picture } from "../components/Picture/Picture";
import { Tag } from "../components/Tag/Tag";
import { PILLARS, SECTORS } from "../data/offer";
import { photo } from "../data/photos";
import { useGsap } from "../hooks/useGsap";
import { usePageReveals } from "../hooks/usePageReveals";
import { PageHero } from "../sections/shared/PageHero";
import "./Expertise.css";

/** Quatre cartes empilées : chacune recouvre la précédente, qui recule. */
function Pillars() {
  const root = useRef<HTMLElement>(null);

  useGsap(
    ({ reduced, scope }) => {
      if (reduced) return;
      const cards = gsap.utils.toArray<HTMLElement>(".pcard", scope);
      cards.forEach((card, i) => {
        gsap.fromTo(
          card.querySelector(".pcard__word"),
          { xPercent: 4 },
          { xPercent: -8, ease: EASE.linear, scrollTrigger: { trigger: card, start: "top bottom", end: "bottom top", scrub: true } },
        );
        const next = cards[i + 1];
        if (!next) return;
        const st = { trigger: next, start: "top bottom", end: "top 30%", scrub: true };
        gsap.to(card, { scale: 0.92, ease: EASE.linear, scrollTrigger: st });
        gsap.to(card.querySelector(".pcard__shade"), { opacity: 0.55, ease: EASE.linear, scrollTrigger: { ...st } });
      });
    },
    root,
  );

  return (
    <section ref={root} className="pillars tone-2 has-grain" aria-labelledby="piliers-title">
      <div className="container">
        <header className="pillars__head">
          <Tag>Principes de travail</Tag>
          <h2 id="piliers-title" className="display-md" data-reveal="lines">
            Quatre exigences, <em>tenues sur chaque dossier.</em>
          </h2>
        </header>
        <div className="pillars__stack">
          {PILLARS.map((p, i) => (
            <article key={p.title} className="pcard" style={{ "--i": i } as CSSProperties}>
              <h3 className="pcard__word">{p.title}</h3>
              <div className="pcard__body">
                <p className="pcard__statement">{p.statement}</p>
                <p className="body-text pcard__text">{p.text}</p>
              </div>
              <span className="pcard__shade" aria-hidden="true" />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Deux photographies qui glissent à des vitesses différentes. */
function Materials() {
  const root = useRef<HTMLElement>(null);

  useGsap(
    ({ scope }) => {
      gsap.matchMedia().add(MEDIA.desktop, () => {
        const st = { trigger: scope, start: "top bottom", end: "bottom top", scrub: true };
        gsap.fromTo(scope.querySelector(".materials__fig--a"), { yPercent: 10 }, { yPercent: -10, ease: EASE.linear, scrollTrigger: st });
        gsap.fromTo(scope.querySelector(".materials__fig--b"), { yPercent: -6 }, { yPercent: 12, ease: EASE.linear, scrollTrigger: { ...st } });
        scope.querySelectorAll<HTMLElement>(".materials__media .tpic").forEach((pic) => {
          gsap.fromTo(pic, { scale: 1.18, yPercent: -6 }, { scale: 1.18, yPercent: 6, ease: EASE.linear, scrollTrigger: { ...st } });
        });
      });
    },
    root,
  );

  return (
    <section ref={root} className="materials tone-1" aria-label="Architecture et matières">
      <div className="materials__grid">
        <figure className="materials__fig materials__fig--a">
          <div className="materials__media" data-reveal="image" data-cursor="voir">
            <Picture photo={photo("screen-tower")} sizes="(min-width: 768px) 40vw, 100vw" position="50% 40%" />
          </div>
          <figcaption className="label">La géométrie avant l’ornement</figcaption>
        </figure>
        <figure className="materials__fig materials__fig--b">
          <div className="materials__media" data-reveal="image" data-reveal-delay="0.15" data-cursor="voir">
            <Picture photo={photo("plaster-niche")} sizes="(min-width: 768px) 55vw, 100vw" position="60% 50%" />
          </div>
          <figcaption className="label">La matière, la ligne et l’ombre</figcaption>
        </figure>
      </div>
    </section>
  );
}

/** Les secteurs défilent en continu ; le défilement de la page les accélère. */
function Sectors() {
  const root = useRef<HTMLElement>(null);

  useGsap(
    ({ reduced, scope }) => {
      if (reduced) return;
      const loops = gsap.utils
        .toArray<HTMLElement>(".marquee__inner", scope)
        .map((row, i) => gsap.fromTo(row, { xPercent: i % 2 ? -50 : 0 }, { xPercent: i % 2 ? 0 : -50, ease: EASE.linear, duration: 42, repeat: -1 }));
      ScrollTrigger.create({
        trigger: scope,
        start: "top bottom",
        end: "bottom top",
        onUpdate: (self) => {
          const dir = self.direction;
          const boost = 1 + Math.min(5, Math.abs(self.getVelocity()) / 350);
          loops.forEach((loop) => {
            gsap.killTweensOf(loop);
            loop.timeScale(boost * dir);
            gsap.to(loop, { timeScale: dir, duration: 1.4, ease: "power2.out" });
          });
        },
      });
    },
    root,
  );

  return (
    <section ref={root} className="sectors tone-3 has-grain" aria-labelledby="secteurs-title">
      <div className="sectors__inner container">
        <header className="sectors__head">
          <Tag>Pour qui</Tag>
          <h2 id="secteurs-title" className="display-md" data-reveal="lines">
            Les entreprises qui <em>répondent aux consultations.</em>
          </h2>
          <p className="body-text" data-reveal="fade">
            Marchés publics ou appels d’offres privés, ponctuels ou réguliers : MUNAQASA intervient auprès des structures qui
            doivent produire des dossiers complets, dans les délais, sans mobiliser toute leur équipe.
          </p>
        </header>
        <ul className="sectors__list">
          {SECTORS.map((s) => (
            <li key={s} className="sectors__item">
              {s}
            </li>
          ))}
        </ul>
      </div>
      <div className="marquee" aria-hidden="true">
        {[0, 1].map((row) => (
          <div key={row} className={`marquee__row${row ? " marquee__row--rev" : ""}`}>
            <div className="marquee__inner">
              {[...SECTORS, ...SECTORS].map((s, i) => (
                <span key={`${s}-${i}`} className="marquee__item">
                  {s}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function Expertise() {
  const ref = usePageReveals();
  return (
    <div ref={ref}>
      <PageHero
        tag="Expertise"
        lines={["La rigueur", <em key="r">n’est pas une option.</em>]}
        intro="Répondre à un appel d’offres, c’est d’abord respecter un cadre : des pièces exigées, des formats imposés, une date qui ne se négocie pas. Notre travail consiste à rendre ce cadre lisible, puis à le tenir."
        image="earth-walls"
        imagePosition="55% 50%"
      />
      <Pillars />
      <Materials />
      <Sectors />
    </div>
  );
}
