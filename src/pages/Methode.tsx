import { useRef } from "react";
import { EASE, gsap, MEDIA, ScrollTrigger } from "../animations/gsap";
import { Tag } from "../components/Tag/Tag";
import { EXCHANGE, TIMELINE } from "../data/method";
import { useGsap } from "../hooks/useGsap";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { usePageReveals } from "../hooks/usePageReveals";
import { ARCH_OUTLINE } from "../lib/arch";
import { PageHero } from "../sections/shared/PageHero";
import "./Methode.css";

type Moment = (typeof TIMELINE)[number];

/** Livrable miniature : il se « remet » quand son moment est atteint. */
function Deliverable({ title }: { title: string }) {
  return (
    <div className="cal-doc" aria-hidden="true">
      <span className="cal-doc__kicker">Vous recevez</span>
      <span className="cal-doc__title">{title}</span>
      <span className="cal-doc__lines">
        <i />
        <i />
        <i />
      </span>
      <span className="cal-doc__stamp">Remis</span>
    </div>
  );
}

/** Ordinateur : le calendrier défile à l'horizontale pendant le défilement vertical. */
function HorizontalCalendar() {
  const root = useRef<HTMLDivElement>(null);

  useGsap(
    ({ scope }) => {
      const q = (s: string) => Array.from(scope.querySelectorAll<HTMLElement>(s));
      const track = q(".cal__track")[0];
      const viewport = q(".cal__viewport")[0];
      if (!track || !viewport) return;
      const scroll = { trigger: scope, start: "top top", end: "bottom bottom", scrub: 0.8, invalidateOnRefresh: true };

      // Fin de course : le dernier moment s'arrête au tiers gauche de l'écran (la marge
      // de fin n'est pas comptée dans scrollWidth, d'où le calcul à partir du panneau).
      const panels = q(".cal-panel");
      const last = panels[panels.length - 1];
      const distance = () => (last ? last.offsetLeft - viewport.clientWidth * 0.3 : track.scrollWidth - viewport.clientWidth);
      const slide = gsap.to(track, { x: () => -distance(), ease: EASE.linear, scrollTrigger: scroll });
      gsap.to(q(".cal__rail-fill"), { scaleX: 1, ease: EASE.linear, scrollTrigger: { ...scroll } });

      panels.forEach((panel, i) => {
        ScrollTrigger.create({
          trigger: panel,
          containerAnimation: slide,
          start: "left 72%",
          onEnter: () => {
            panel.classList.add("is-active");
            q(".cal__rail-mark")[i]?.classList.add("is-active");
          },
          onLeaveBack: () => {
            panel.classList.remove("is-active");
            q(".cal__rail-mark")[i]?.classList.remove("is-active");
          },
        });
      });
    },
    root,
  );

  return (
    <div ref={root} className="cal__outer">
      <div className="cal__sticky">
        <header className="cal__head container">
          <Tag>Le calendrier d’une consultation</Tag>
          <h2 id="calendrier-title" className="display-md">
            Chaque moment <em>a son livrable.</em>
          </h2>
        </header>
        <div className="cal__rail container" aria-hidden="true">
          <span className="cal__rail-line">
            <span className="cal__rail-fill" />
          </span>
          {TIMELINE.map((t) => (
            <span key={t.moment} className="cal__rail-mark" />
          ))}
        </div>
        <div className="cal__viewport">
          <ol className="cal__track">
            {TIMELINE.map((t) => (
              <li key={t.moment} className="cal-panel">
                <h3 className="cal-moment">{t.moment}</h3>
                <p className="cal-action">{t.action}</p>
                <Deliverable title={t.deliverable} />
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

/** Mobile, tablette, mouvement réduit : la même chronologie, à la verticale. */
function VerticalCalendar() {
  const root = useRef<HTMLDivElement>(null);

  useGsap(
    ({ reduced, scope }) => {
      const rows = Array.from(scope.querySelectorAll<HTMLElement>(".timeline__row"));
      if (reduced) {
        rows.forEach((r) => r.classList.add("is-reached"));
        return;
      }
      gsap.fromTo(
        scope.querySelector(".timeline__line-fill"),
        { scaleY: 0 },
        { scaleY: 1, ease: EASE.linear, scrollTrigger: { trigger: scope, start: "top 62%", end: "bottom 62%", scrub: true } },
      );
      rows.forEach((row) => {
        ScrollTrigger.create({
          trigger: row,
          start: "top 62%",
          onEnter: () => row.classList.add("is-reached"),
          onLeaveBack: () => row.classList.remove("is-reached"),
        });
      });
    },
    root,
  );

  return (
    <div className="container">
      <header className="timeline__head">
        <Tag>Le calendrier d’une consultation</Tag>
        <h2 id="calendrier-title" className="display-lg" data-reveal="lines">
          Chaque moment <em>a son livrable.</em>
        </h2>
      </header>
      <div ref={root} className="timeline__list">
        <span className="timeline__line" aria-hidden="true">
          <span className="timeline__line-fill" />
        </span>
        <ol>
          {TIMELINE.map((t: Moment) => (
            <li key={t.moment} className="timeline__row">
              <h3 className="timeline__moment">{t.moment}</h3>
              <div className="timeline__body">
                <p className="timeline__action">{t.action}</p>
                <Deliverable title={t.deliverable} />
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/** Ce que vous confiez traverse l'arche et ressort en livrables. */
function Exchange() {
  const root = useRef<HTMLDivElement>(null);

  useGsap(
    ({ reduced, scope }) => {
      if (reduced) return;
      const q = (s: string) => Array.from(scope.querySelectorAll<HTMLElement>(s));
      const given = q(".exchange__given li");
      const returned = q(".exchange__returned li");
      const tl = gsap.timeline({
        defaults: { ease: EASE.out },
        scrollTrigger: { trigger: scope, start: "top 72%", end: "bottom 55%", scrub: 0.6 },
      });
      tl.to(q(".exchange__arch path"), { strokeDashoffset: 0, duration: 1.2, ease: EASE.architect }, 0);
      given.forEach((item, i) => {
        const at = 0.6 + i * 0.7;
        tl.to(item, { x: 24, opacity: 0.35, duration: 0.5 }, at)
          .to(q(".exchange__glow"), { opacity: 1, duration: 0.2 }, at + 0.2)
          .to(q(".exchange__glow"), { opacity: 0, duration: 0.3 }, at + 0.45);
        const out = returned[i];
        if (out) tl.to(out, { autoAlpha: 1, x: 0, duration: 0.5 }, at + 0.35);
      });
    },
    root,
  );

  return (
    <div ref={root} className="exchange">
      <h2 className="display-md exchange__title" data-reveal="lines">
        Vous gardez la main, <em>nous tenons le fil.</em>
      </h2>
      <div className="exchange__cols">
        <div className="exchange__col exchange__given">
          <h3 className="label">Ce que vous nous confiez</h3>
          <ul>
            {EXCHANGE.given.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </div>
        <div className="exchange__core" aria-hidden="true">
          <svg className="exchange__arch" viewBox="0 0 200 240">
            <path pathLength={1} d={ARCH_OUTLINE} />
          </svg>
          <span className="exchange__glow" />
        </div>
        <div className="exchange__col exchange__returned">
          <h3 className="label">Ce que nous vous remettons</h3>
          <ul>
            {EXCHANGE.returned.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default function Methode() {
  const ref = usePageReveals();
  const wide = useMediaQuery(MEDIA.desktop);

  return (
    <div ref={ref}>
      <PageHero
        tag="Méthode"
        lines={["Du premier avis", <em key="d">au dossier final.</em>]}
        intro="Une consultation suit toujours le même calendrier. Notre méthode s’y cale : à chaque moment, une action précise et un livrable que vous gardez."
        image="corridor"
        imagePosition="50% 50%"
      />

      <section className={`method-page tone-2 has-grain${wide ? " method-page--wide" : ""}`} aria-labelledby="calendrier-title">
        {wide ? <HorizontalCalendar /> : <VerticalCalendar />}
      </section>

      <section className="method-exchange tone-1 has-grain" aria-label="Échange avec votre entreprise">
        <div className="container">
          <Exchange />
        </div>
      </section>
    </div>
  );
}
