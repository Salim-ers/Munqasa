import { ArrowUpRight } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { EASE, gsap } from "../../animations/gsap";
import { Picture } from "../../components/Picture/Picture";
import { Tag } from "../../components/Tag/Tag";
import { TransitionLink } from "../../components/TransitionLink/TransitionLink";
import { photo } from "../../data/photos";
import { SERVICES, type Service } from "../../data/services";
import { useGsap } from "../../hooks/useGsap";
import { archPolygon } from "../../lib/arch";
import "./ServicesMosaic.css";

const ARCH = archPolygon(30);

function Block({ service, className, media, children }: { service: Service; className: string; media?: ReactNode; children?: ReactNode }) {
  return (
    <TransitionLink to={`/services#${service.slug}`} className={`svc ${className}`} data-cursor="ouvrir">
      {media}
      <span className="svc__body">
        <span className="svc__top">
          <span className="svc__num numeral">{service.number}</span>
          <Tag className="svc__ref">{service.ref}</Tag>
        </span>
        <span className="svc__title">{service.title}</span>
        <span className="svc__text">{service.short}</span>
        {children}
        <span className="svc__more label">
          Ouvrir <ArrowUpRight size={14} strokeWidth={1.5} aria-hidden="true" />
        </span>
      </span>
    </TransitionLink>
  );
}

function service(slug: string): Service {
  const found = SERVICES.find((s) => s.slug === slug);
  if (!found) throw new Error(`Service inconnu : ${slug}`);
  return found;
}

export function ServicesMosaic() {
  const root = useRef<HTMLElement>(null);

  useGsap(
    ({ reduced, scope }) => {
      if (reduced) return;
      const q = gsap.utils.selector(scope);
      q(".svc").forEach((el) => {
        gsap.from(el, { y: 48, autoAlpha: 0, duration: 1.1, ease: EASE.premium, scrollTrigger: { trigger: el, start: "top 90%", once: true } });
      });
      // Coordination : les contributions rejoignent le dossier.
      gsap.fromTo(
        q(".coord__link"),
        { strokeDashoffset: 1 },
        { strokeDashoffset: 0, duration: 1.2, ease: EASE.architect, stagger: 0.12, scrollTrigger: { trigger: q(".coord")[0], start: "top 80%", once: true } },
      );
      // Suivi : l'avancement progresse jusqu'au dépôt.
      gsap.fromTo(
        q(".timeline__fill"),
        { scaleX: 0 },
        { scaleX: 1, duration: 1.6, ease: EASE.architect, scrollTrigger: { trigger: q(".timeline")[0], start: "top 85%", once: true } },
      );
    },
    root,
  );

  return (
    <section ref={root} className="services surface-stone has-grain" data-surface="light" aria-labelledby="services-title">
      <div className="container">
        <header className="services__head">
          <Tag>Services</Tag>
          <h2 id="services-title" className="display-lg" data-reveal="lines">
            Huit compétences. <em>Un seul dossier.</em>
          </h2>
          <p className="body-text" data-reveal="fade">
            De la veille au suivi, chaque intervention peut être confiée séparément ou s’inscrire dans un accompagnement
            complet.
          </p>
        </header>

        <div className="services__grid">
          <Block
            service={service("veille")}
            className="svc--tall"
            media={
              <span className="svc__media svc__media--arch" style={{ clipPath: ARCH }} data-cursor="voir">
                <Picture photo={photo("arch-niche")} sizes="(min-width: 1024px) 38vw, 100vw" position="50% 60%" />
              </span>
            }
          />

          <Block
            service={service("analyse")}
            className="svc--wide"
            media={
              <span className="svc__media svc__media--side">
                <Picture photo={photo("lattice-facade")} sizes="(min-width: 1024px) 20vw, 100vw" position="50% 30%" />
              </span>
            }
          >
            <span className="svc__chips" aria-hidden="true">
              {["RC", "CPS", "Annexes", "Échéances"].map((c) => (
                <span key={c} className="svc__chip label">
                  {c}
                </span>
              ))}
            </span>
          </Block>

          <Block service={service("dossier-administratif")} className="svc--narrow">
            <span className="svc__index" aria-hidden="true">
              {["A.01", "A.02", "A.03", "A.04"].map((r) => (
                <span key={r}>
                  <span className="label">{r}</span>
                  <i />
                </span>
              ))}
            </span>
          </Block>

          <Block
            service={service("offre-technique")}
            className="svc--photo"
            media={
              <span className="svc__media svc__media--cover">
                <Picture photo={photo("drawing-table")} sizes="(min-width: 1024px) 34vw, 100vw" position="50% 50%" />
              </span>
            }
          />

          <Block service={service("coordination")} className="svc--dark surface-ink">
            <svg className="coord" viewBox="0 0 320 150" aria-hidden="true">
              {[
                [40, 28],
                [280, 28],
                [40, 122],
                [280, 122],
              ].map(([x, y]) => (
                <path key={`${x}-${y}`} className="coord__link" pathLength={1} d={`M${x} ${y} L160 75`} />
              ))}
              <rect x="122" y="56" width="76" height="38" className="coord__hub" />
              <text x="160" y="79" textAnchor="middle" className="coord__hub-text">
                DOSSIER
              </text>
              {[
                [40, 28, "Direction"],
                [280, 28, "Technique"],
                [40, 122, "Finance"],
                [280, 122, "Partenaires"],
              ].map(([x, y, label]) => (
                <g key={label as string}>
                  <circle cx={x as number} cy={y as number} r="4" className="coord__node" />
                  <text x={x as number} y={(y as number) < 75 ? (y as number) - 12 : (y as number) + 20} textAnchor="middle" className="coord__label">
                    {label}
                  </text>
                </g>
              ))}
            </svg>
          </Block>

          <Block service={service("controle")} className="svc--check">
            <ul className="svc__checks" aria-hidden="true">
              {["Pièces", "Signatures", "Versions", "Formats"].map((c) => (
                <li key={c}>
                  <span className="svc__box" />
                  <span className="label">{c}</span>
                </li>
              ))}
            </ul>
          </Block>

          <Block service={service("soumission")} className="svc--tree">
            <span className="tree" aria-hidden="true">
              <span className="tree__root label">AO / Dossier</span>
              {["01_Administratif", "02_Technique", "03_Financier", "04_Annexes"].map((f) => (
                <span key={f} className="tree__item label">
                  {f}
                </span>
              ))}
            </span>
          </Block>

          <Block
            service={service("suivi")}
            className="svc--long"
            media={
              <span className="svc__media svc__media--band">
                <Picture photo={photo("sand-tower")} sizes="(min-width: 1024px) 24vw, 100vw" position="50% 40%" />
              </span>
            }
          >
            <span className="timeline" aria-hidden="true">
              <span className="timeline__track">
                <span className="timeline__fill" />
              </span>
              {["Avis", "Additif", "Dépôt", "Résultat"].map((m) => (
                <span key={m} className="timeline__mark label">
                  {m}
                </span>
              ))}
            </span>
          </Block>
        </div>
      </div>
    </section>
  );
}
