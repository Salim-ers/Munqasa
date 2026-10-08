import { ServiceScene } from "../components/ServiceScene/ServiceScene";
import { SERVICES, type Service } from "../data/services";
import { usePageReveals } from "../hooks/usePageReveals";
import { PageHero } from "../sections/shared/PageHero";
import "./Services.css";

/**
 * Page Services : chaque chapitre montre le service en action (scène animée au
 * défilement). Les photographies des services vivent sur l'accueil (aperçus au
 * survol) : aucune n'est répétée ici.
 */
function Chapter({ service, index }: { service: Service; index: number }) {
  const flip = index % 2 === 1;
  return (
    <section
      id={service.slug}
      className={`chapter${flip ? " chapter--flip" : ""} ${flip ? "tone-2" : "tone-1"} has-grain`}
      aria-labelledby={`${service.slug}-title`}
    >
      <div className="chapter__grid container">
        <div className="chapter__content">
          <h2 id={`${service.slug}-title`} className="display-md" data-reveal="lines">
            {service.title}
          </h2>
          <p className="chapter__lead" data-reveal="fade">
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
            <span className="label">Vous recevez</span>
            <span>{service.deliverable}</span>
          </p>
        </div>

        <div className="chapter__scene" data-reveal="fade">
          <ServiceScene kind={service.slug} />
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
        lines={["Structurer.", "Coordonner.", <em key="s">Soumettre.</em>]}
        intro="De la veille des avis au suivi des résultats : chaque intervention se confie seule, ou s’inscrit dans un accompagnement complet."
        image="museum-entrance"
        imagePosition="50% 55%"
        frame="arch"
      />
      {SERVICES.map((s, i) => (
        <Chapter key={s.slug} service={s} index={i} />
      ))}
    </div>
  );
}
