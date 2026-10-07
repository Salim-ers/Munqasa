import { ArrowUpRight } from "lucide-react";
import { useRef, useState } from "react";
import { gsap } from "../../animations/gsap";
import { Picture } from "../../components/Picture/Picture";
import { Tag } from "../../components/Tag/Tag";
import { TransitionLink } from "../../components/TransitionLink/TransitionLink";
import { photo } from "../../data/photos";
import { SERVICES } from "../../data/services";
import { useGsap } from "../../hooks/useGsap";
import { useFinePointer } from "../../hooks/useMediaQuery";
import "./ServicesIndex.css";

/**
 * Index éditorial des services : une ligne par savoir-faire. Au survol, la
 * photographie correspondante (jour ou nuit) suit le pointeur.
 */
export function ServicesIndex() {
  const root = useRef<HTMLElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const fine = useFinePointer();

  useGsap(
    ({ reduced, scope }) => {
      const preview = scope.querySelector<HTMLElement>(".sidx__preview");
      const list = scope.querySelector<HTMLElement>(".sidx__list");
      if (!preview || !list || !fine || reduced) return;
      const moveY = gsap.quickTo(preview, "y", { duration: 0.6, ease: "power3.out" });
      const onMove = (e: PointerEvent) => {
        const r = list.getBoundingClientRect();
        const max = r.height - preview.offsetHeight;
        moveY(gsap.utils.clamp(0, Math.max(0, max), e.clientY - r.top - preview.offsetHeight / 2));
      };
      list.addEventListener("pointermove", onMove);
      return () => list.removeEventListener("pointermove", onMove);
    },
    root,
    [fine],
  );

  return (
    <section ref={root} className="sidx tone-1 has-grain" aria-labelledby="sidx-title">
      <div className="sidx__inner container">
        <header className="sidx__head">
          <Tag>Services</Tag>
          <h2 id="sidx-title" className="display-lg" data-reveal="lines">
            Tout ce qu’un dossier <em>exige.</em>
          </h2>
          <p className="body-text" data-reveal="fade">
            Chaque intervention se confie seule, ou s’inscrit dans un accompagnement complet.
          </p>
        </header>

        <div className="sidx__body">
          <ul className="sidx__list" onPointerLeave={() => setActive(null)}>
            {SERVICES.map((s, i) => (
              <li key={s.slug} data-reveal="fade" data-reveal-delay={String((i % 4) * 0.05)}>
                <TransitionLink
                  to={`/services#${s.slug}`}
                  className={`sidx__row${active === i ? " is-active" : ""}`}
                  data-cursor="ouvrir"
                  onPointerEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                >
                  <span className="sidx__title">{s.title}</span>
                  <span className="sidx__short">{s.short}</span>
                  <ArrowUpRight className="sidx__arrow" size={20} strokeWidth={1.25} aria-hidden="true" />
                </TransitionLink>
              </li>
            ))}
          </ul>

          {fine && (
            <div className={`sidx__preview${active !== null ? " is-visible" : ""}`} aria-hidden="true">
              {SERVICES.map((s, i) => (
                <div key={s.slug} className={`sidx__shot${active === i ? " is-active" : ""}`}>
                  <Picture photo={photo(s.photo)} sizes="(min-width: 1024px) 26vw, 1px" alt="" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
