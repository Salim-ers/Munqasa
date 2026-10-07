import { Picture } from "../components/Picture/Picture";
import { Tag } from "../components/Tag/Tag";
import { PILLARS, SECTORS } from "../data/offer";
import { photo } from "../data/photos";
import { usePageReveals } from "../hooks/usePageReveals";
import { PageHero } from "../sections/shared/PageHero";
import "./Expertise.css";

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

      <section className="pillars tone-2 has-grain" aria-labelledby="piliers-title">
        <div className="container">
          <header className="pillars__head">
            <Tag>Principes de travail</Tag>
            <h2 id="piliers-title" className="display-md" data-reveal="lines">
              Quatre exigences, <em>tenues sur chaque dossier.</em>
            </h2>
          </header>
          <ul className="pillars__list">
            {PILLARS.map((p) => (
              <li key={p.title} className="pillar">
                <h3 className="label pillar__title">{p.title}</h3>
                <p className="pillar__statement" data-reveal="lines">
                  {p.statement}
                </p>
                <p className="body-text pillar__text" data-reveal="fade">
                  {p.text}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="materials tone-1" aria-label="Architecture et matières">
        <div className="materials__grid">
          <figure className="materials__fig materials__fig--a">
            <div className="materials__media" data-reveal="image" data-cursor="voir">
              <Picture photo={photo("lattice-facade")} sizes="(min-width: 768px) 40vw, 100vw" position="50% 35%" />
            </div>
            <figcaption className="label">La géométrie avant l’ornement</figcaption>
          </figure>
          <figure className="materials__fig materials__fig--b">
            <div className="materials__media" data-reveal="image" data-reveal-delay="0.15" data-cursor="voir">
              <Picture photo={photo("museum-entrance")} sizes="(min-width: 768px) 55vw, 100vw" position="50% 55%" />
            </div>
            <figcaption className="label">Terre cuite, pierre et métal noir</figcaption>
          </figure>
        </div>
      </section>

      <section className="sectors tone-3 has-grain" aria-labelledby="secteurs-title">
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
            {SECTORS.map((s, i) => (
              <li key={s} className="sectors__item" data-reveal="fade" data-reveal-delay={String(i * 0.05)}>
                {s}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
