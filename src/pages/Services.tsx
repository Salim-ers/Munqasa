import { EASE, gsap, MEDIA } from "../animations/gsap";
import { Picture } from "../components/Picture/Picture";
import { photo } from "../data/photos";
import { SERVICES, type Service } from "../data/services";
import { useGsap } from "../hooks/useGsap";
import { usePageReveals } from "../hooks/usePageReveals";
import { archPolygon } from "../lib/arch";
import { PageHero } from "../sections/shared/PageHero";
import "./Services.css";

/** Trois mises en page qui alternent cadrage et lumière : jamais deux fois la même à la suite. */
const LAYOUTS = ["arch", "tall", "band"] as const;
const ARCH = archPolygon(30);

function Chapter({ service, index }: { service: Service; index: number }) {
  const layout = LAYOUTS[index % LAYOUTS.length] ?? "arch";
  return (
    <section id={service.slug} className={`chapter chapter--${layout} ${index % 2 ? "tone-2" : "tone-1"} has-grain`} aria-labelledby={`${service.slug}-title`}>
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

        <div className="chapter__media">
          <div className="chapter__frame" data-reveal="image" data-cursor="voir">
            <div className="chapter__clip" style={layout === "arch" ? { clipPath: ARCH } : undefined}>
              <Picture photo={photo(service.photo)} sizes={layout === "band" ? "(min-width: 1024px) 75vw, 100vw" : "(min-width: 1024px) 34vw, 100vw"} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Services() {
  const ref = usePageReveals();

  // Parallaxe légère des photographies dans leur cadre.
  useGsap(
    ({ scope }) => {
      gsap.matchMedia().add(MEDIA.desktop, () => {
        gsap.utils.toArray<HTMLElement>(".chapter__clip > .tpic", scope).forEach((clip) => {
          gsap.fromTo(clip, { yPercent: -6, scale: 1.12 }, { yPercent: 6, scale: 1.12, ease: EASE.linear, scrollTrigger: { trigger: clip, start: "top bottom", end: "bottom top", scrub: true } });
        });
      });
    },
    ref,
  );

  return (
    <div ref={ref}>
      <PageHero
        tag="Services"
        lines={["Structurer.", "Coordonner.", <em key="s">Soumettre.</em>]}
        intro="De la veille des avis au suivi des résultats : chaque intervention se confie seule, ou s’inscrit dans un accompagnement complet."
        image="arch-niche"
        imagePosition="50% 62%"
        frame="arch"
      />
      {SERVICES.map((s, i) => (
        <Chapter key={s.slug} service={s} index={i} />
      ))}
    </div>
  );
}
