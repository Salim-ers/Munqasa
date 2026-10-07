import { DocSheet } from "../components/DocSheet/DocSheet";
import { Picture } from "../components/Picture/Picture";
import { Tag } from "../components/Tag/Tag";
import { TransitionLink } from "../components/TransitionLink/TransitionLink";
import { photo } from "../data/photos";
import { SERVICES, type Service } from "../data/services";
import { usePageReveals } from "../hooks/usePageReveals";
import { archPolygon } from "../lib/arch";
import { FinalCta } from "../sections/shared/FinalCta";
import { PageHero } from "../sections/shared/PageHero";
import { Scope } from "../sections/shared/Scope";
import "./Services.css";

/** Quatre mises en page qui alternent lumière et cadrage — jamais deux fois la même à la suite. */
const LAYOUTS = [
  { variant: "arch", surface: "ivory" },
  { variant: "tall", surface: "stone" },
  { variant: "sheet", surface: "night" },
  { variant: "band", surface: "warm" },
] as const;

const ARCH = archPolygon(30);

function Chapter({ service, index }: { service: Service; index: number }) {
  const layout = LAYOUTS[index % LAYOUTS.length] ?? LAYOUTS[0];
  const dark = layout.surface === "night";
  return (
    <section
      id={service.slug}
      className={`chapter chapter--${layout.variant} surface-${layout.surface} has-grain`}
      data-surface={dark ? "dark" : "light"}
      aria-labelledby={`${service.slug}-title`}
    >
      <div className="chapter__grid container">
        <span className="chapter__num numeral" aria-hidden="true">
          {service.number}
        </span>

        <div className="chapter__content">
          <Tag>{`${service.number} — ${service.ref}`}</Tag>
          <h2 id={`${service.slug}-title`} className="display-md" data-reveal="lines">
            {service.title}
          </h2>
          <p className="lead chapter__lead" data-reveal="fade">
            {service.short}
          </p>
          <p className="body-text" data-reveal="fade">
            {service.intro}
          </p>
          <ul className="chapter__tasks" data-reveal="fade">
            {service.tasks.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <p className="chapter__deliverable" data-reveal="fade">
            <span className="label">Livrable</span>
            <span>{service.deliverable}</span>
          </p>
          {service.note && <p className="chapter__note">{service.note}</p>}
        </div>

        <div className="chapter__media">
          {layout.variant === "sheet" ? (
            <div className="chapter__sheets" aria-hidden="true">
              <DocSheet docRef={`Pièce ${service.number}`} title={service.ref} lines={9} className="chapter__sheet chapter__sheet--back" />
              <DocSheet docRef={`Pièce ${service.number}`} title={service.title} tab="Rev. A" lines={8} className="chapter__sheet" />
            </div>
          ) : (
            service.photo && (
              <div className="chapter__frame" data-reveal="image" data-cursor="voir">
                <div className="chapter__clip" style={layout.variant === "arch" ? { clipPath: ARCH } : undefined}>
                  <Picture photo={photo(service.photo)} sizes={layout.variant === "band" ? "(min-width: 1024px) 60vw, 100vw" : "(min-width: 1024px) 34vw, 100vw"} />
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </section>
  );
}

export default function Services() {
  const ref = usePageReveals();
  return (
    <div ref={ref}>
      <PageHero
        tag="Services"
        sheet="Feuillet 02 / 05"
        lines={["Structurer.", "Coordonner.", <em key="s">Soumettre.</em>]}
        intro="Huit interventions, de la veille des avis au suivi des résultats. Chacune peut être confiée seule ou s’inscrire dans un accompagnement complet."
        image="arch-niche"
        imagePosition="50% 62%"
        frame="arch"
      />

      <nav className="services-index surface-ivory" aria-label="Sommaire des services">
        <div className="services-index__inner container">
          <span className="label services-index__title">Sommaire</span>
          <ol>
            {SERVICES.map((s) => (
              <li key={s.slug}>
                <TransitionLink to={`/services#${s.slug}`}>
                  <span className="label">{s.number}</span> {s.title}
                </TransitionLink>
              </li>
            ))}
          </ol>
        </div>
      </nav>

      {SERVICES.map((s, i) => (
        <Chapter key={s.slug} service={s} index={i} />
      ))}

      <Scope />
      <FinalCta />
    </div>
  );
}
