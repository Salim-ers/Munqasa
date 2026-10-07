import { useRef } from "react";
import { EASE, gsap, ScrollTrigger } from "../animations/gsap";
import { Tag } from "../components/Tag/Tag";
import { EXCHANGE, TIMELINE } from "../data/method";
import { useGsap } from "../hooks/useGsap";
import { usePageReveals } from "../hooks/usePageReveals";
import { PageHero } from "../sections/shared/PageHero";
import "./Methode.css";

export default function Methode() {
  const ref = usePageReveals();
  const timeline = useRef<HTMLElement>(null);

  // Le trait suit le calendrier de la consultation ; chaque moment s'allume quand il est atteint.
  useGsap(
    ({ reduced, scope }) => {
      const q = gsap.utils.selector(scope);
      const rows = gsap.utils.toArray<HTMLElement>(".timeline__row", scope);
      if (reduced) {
        rows.forEach((r) => r.classList.add("is-reached"));
        return;
      }
      gsap.fromTo(
        q(".timeline__line-fill"),
        { scaleY: 0 },
        { scaleY: 1, ease: EASE.linear, scrollTrigger: { trigger: q(".timeline__list")[0], start: "top 62%", end: "bottom 62%", scrub: true } },
      );
      rows.forEach((row) => {
        ScrollTrigger.create({
          trigger: row,
          start: "top 62%",
          onEnter: () => row.classList.add("is-reached"),
          onLeaveBack: () => row.classList.remove("is-reached"),
        });
      });
      gsap.fromTo(
        q(".exchange__flow-line"),
        { scaleX: 0 },
        { scaleX: 1, duration: 1.4, ease: EASE.architect, scrollTrigger: { trigger: q(".exchange")[0], start: "top 70%", once: true } },
      );
    },
    timeline,
  );

  return (
    <div ref={ref}>
      <PageHero
        tag="Méthode"
        lines={["Du premier avis", <em key="d">au dossier final.</em>]}
        intro="Une consultation suit toujours le même calendrier. Notre méthode s’y cale : à chaque moment, une action précise et un livrable que vous gardez."
        image="arcade-shadow"
        imagePosition="40% 50%"
      />

      <section ref={timeline} className="method-page tone-2 has-grain" aria-labelledby="calendrier-title">
        <div className="container">
          <header className="timeline__head">
            <Tag>Le calendrier d’une consultation</Tag>
            <h2 id="calendrier-title" className="display-lg" data-reveal="lines">
              Chaque moment <em>a son livrable.</em>
            </h2>
          </header>

          <div className="timeline__list">
            <span className="timeline__line" aria-hidden="true">
              <span className="timeline__line-fill" />
            </span>
            <ol>
              {TIMELINE.map((t) => (
                <li key={t.moment} className="timeline__row">
                  <h3 className="timeline__moment">{t.moment}</h3>
                  <div className="timeline__body">
                    <p className="timeline__action">{t.action}</p>
                    <p className="timeline__deliverable">
                      <span className="label">Vous recevez</span>
                      {t.deliverable}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="exchange">
            <h2 className="display-md exchange__title" data-reveal="lines">
              Vous gardez la main, <em>nous tenons le fil.</em>
            </h2>
            <div className="exchange__cols">
              <div className="exchange__col">
                <h3 className="label">Ce que vous nous confiez</h3>
                <ul>
                  {EXCHANGE.given.map((g) => (
                    <li key={g}>{g}</li>
                  ))}
                </ul>
              </div>
              <span className="exchange__flow" aria-hidden="true">
                <span className="exchange__flow-line" />
              </span>
              <div className="exchange__col">
                <h3 className="label">Ce que nous vous remettons</h3>
                <ul>
                  {EXCHANGE.returned.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
