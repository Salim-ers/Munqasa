import { useRef, useState } from "react";
import { EASE, gsap } from "../../animations/gsap";
import { Tag } from "../../components/Tag/Tag";
import { CHECKLIST } from "../../data/method";
import { useGsap } from "../../hooks/useGsap";
import "./Checklist.css";

const pad = (n: number) => String(n).padStart(2, "0");

export function Checklist() {
  const root = useRef<HTMLElement>(null);
  const [checked, setChecked] = useState(0);
  const done = checked === CHECKLIST.length;

  useGsap(
    ({ reduced, scope }) => {
      const rows = gsap.utils.toArray<HTMLElement>(".checklist__row", scope);
      if (reduced) {
        rows.forEach((row) => row.classList.add("is-checked"));
        setChecked(rows.length);
        return;
      }
      // Une case se coche parce qu'un contrôle est effectué : au passage de chaque ligne.
      const done = new Set<HTMLElement>();
      rows.forEach((row) => {
        const path = row.querySelector("path");
        gsap
          .timeline({
            scrollTrigger: {
              trigger: row,
              start: "top 68%",
              end: "top 48%",
              scrub: 0.4,
              onLeave: () => {
                done.add(row);
                row.classList.add("is-checked");
                setChecked(done.size);
              },
              onEnterBack: () => {
                done.delete(row);
                row.classList.remove("is-checked");
                setChecked(done.size);
              },
            },
          })
          .fromTo(path, { strokeDashoffset: 1 }, { strokeDashoffset: 0, ease: EASE.linear })
          .fromTo(row.querySelector(".checklist__name"), { opacity: 0.38 }, { opacity: 1, ease: EASE.linear }, 0)
          .fromTo(row.querySelector(".checklist__rule"), { scaleX: 0 }, { scaleX: 1, ease: EASE.linear }, 0);
      });
    },
    root,
  );

  return (
    <section ref={root} className="checklist surface-night has-grain" data-surface="dark" aria-labelledby="checklist-title">
      <div className="checklist__inner container">
        <div className="checklist__head">
          <Tag>Contrôle avant dépôt</Tag>
          <h2 id="checklist-title" className="display-lg" data-reveal="lines">
            Avant de déposer, <em>tout doit être à sa place.</em>
          </h2>
          <p className="body-text" data-reveal="fade">
            Chaque pièce est confrontée aux exigences du dossier de consultation : présence, version, signature, format,
            date. Les écarts sont corrigés avant l’échéance, pas après.
          </p>
          <p className={`checklist__status label${done ? " is-done" : ""}`} aria-hidden="true">
            <span className="checklist__status-dot" />
            <span>{done ? "Revue terminée" : "Revue en cours"}</span>
            <span className="checklist__count">
              {pad(checked)} / {pad(CHECKLIST.length)}
            </span>
          </p>
        </div>

        <ol className="checklist__list">
          {CHECKLIST.map((item) => (
            <li key={item.ref} className="checklist__row">
              <span className="label checklist__ref">{item.ref}</span>
              <span className="checklist__name">{item.label}</span>
              <span className="checklist__box" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path pathLength={1} d="M5 12.5 10 17.5 19.5 7" />
                </svg>
              </span>
              <span className="checklist__rule" aria-hidden="true" />
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
