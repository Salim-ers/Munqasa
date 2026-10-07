import { useRef, useState } from "react";
import { gsap, MEDIA } from "../../animations/gsap";
import { CtaLink } from "../../components/CtaLink/CtaLink";
import { DocStage } from "../../components/DocStage/DocStage";
import { Tag } from "../../components/Tag/Tag";
import { METHOD_STEPS } from "../../data/method";
import { useGsap } from "../../hooks/useGsap";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import "./MethodSticky.css";

const TOTAL = METHOD_STEPS.length;
const pad = (n: number) => String(n).padStart(2, "0");

export function MethodSticky() {
  const root = useRef<HTMLElement>(null);
  const [step, setStep] = useState(1);
  const sticky = useMediaQuery(MEDIA.desktop);

  useGsap(
    ({ scope }) => {
      if (!sticky) return;
      gsap.to(scope.querySelector(".method__progress-fill"), {
        scaleY: 1,
        ease: "none",
        scrollTrigger: {
          trigger: scope.querySelector(".method__track"),
          start: "top top",
          end: "bottom bottom",
          scrub: true,
          onUpdate: (self) => setStep(Math.min(TOTAL, Math.floor(self.progress * TOTAL) + 1)),
        },
      });
    },
    root,
    [sticky],
  );

  const current = METHOD_STEPS[step - 1];

  return (
    <section ref={root} className="method surface-dusk" data-surface="dark" aria-labelledby="methode-title">
      <div className="method__dusk" aria-hidden="true">
        <span data-surface="light" />
      </div>

      {sticky ? (
        <div className="method__track" style={{ height: `${100 + TOTAL * 55}vh` }}>
          <div className="method__sticky">
            <div className="method__grid container">
              <div className="method__col">
                <Tag>Méthode</Tag>
                <h2 id="methode-title" className="display-md">
                  De l’opportunité <em>à la soumission.</em>
                </h2>
                <div className="method__steps">
                  <span className="method__progress" aria-hidden="true">
                    <span className="method__progress-fill" />
                  </span>
                  <ol>
                    {METHOD_STEPS.map((s, i) => (
                      <li
                        key={s.number}
                        className={`method__step${i + 1 === step ? " is-active" : ""}${i + 1 < step ? " is-done" : ""}`}
                        aria-current={i + 1 === step ? "step" : undefined}
                      >
                        <span className="label method__num">{s.number}</span>
                        <span className="method__title">{s.title}</span>
                        <span className="visually-hidden">
                          {" "}
                          — {s.text} Livrable : {s.deliverable}.
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>

              <div className="method__stage">
                <DocStage step={step} />
                <div className="method__detail" aria-hidden="true">
                  <p className="label method__counter">
                    Étape {pad(step)} / {pad(TOTAL)} — {current?.title}
                  </p>
                  <p className="method__text">{current?.text}</p>
                  <p className="label method__deliverable">Livrable · {current?.deliverable}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="method__mobile container">
          <Tag>Méthode</Tag>
          <h2 id="methode-title" className="display-md" data-reveal="lines">
            De l’opportunité <em>à la soumission.</em>
          </h2>
          <ol className="method__timeline">
            {METHOD_STEPS.map((s, i) => (
              <li key={s.number} className="method__card" data-reveal="fade">
                <span className="label method__num">
                  Étape {s.number} / {pad(TOTAL)}
                </span>
                <h3 className="method__card-title">{s.title}</h3>
                <p className="method__text">{s.text}</p>
                <DocStage step={i + 1} className="method__mini" />
                <p className="label method__deliverable">Livrable · {s.deliverable}</p>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="method__cta container">
        <CtaLink to="/methode" variant="outline" arrow="right">
          Voir la méthode en détail
        </CtaLink>
      </div>
    </section>
  );
}
