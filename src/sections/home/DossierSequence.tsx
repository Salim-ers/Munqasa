import { useRef, type CSSProperties } from "react";
import { EASE, gsap, MEDIA } from "../../animations/gsap";
import { Tag } from "../../components/Tag/Tag";
import { SEQUENCE_FOLDERS, SEQUENCE_PHASES } from "../../data/method";
import { useGsap } from "../../hooks/useGsap";
import { ARCH_OUTLINE } from "../../lib/arch";
import "./DossierSequence.css";

/** Où chaque pièce atterrit quand elle « arrive de partout » (fractions de la planche, degrés). */
const SCATTER = [
  { x: 0.16, y: 0.42, r: -14 },
  { x: 0.52, y: 0.3, r: 9 },
  { x: 0.84, y: 0.46, r: -7 },
  { x: 0.3, y: 0.7, r: 12 },
  { x: 0.66, y: 0.62, r: -11 },
  { x: 0.1, y: 0.8, r: 6 },
  { x: 0.45, y: 0.86, r: -5 },
  { x: 0.9, y: 0.78, r: 15 },
  { x: 0.36, y: 0.52, r: 8 },
  { x: 0.74, y: 0.2, r: -9 },
];

const SHEETS = [
  { key: "avis", kicker: "Avis", title: "Avis d’appel d’offres", lines: [92, 78, 88, 64, 84] },
  { key: "rc", kicker: "Règlement", title: "Règlement de consultation", lines: [90, 82, 94, 70, 86, 60], marks: [1, 3] },
  { key: "cps", kicker: "Cahier", title: "Cahier des prescriptions spéciales", lines: [86, 92, 74, 88, 66, 80], marks: [0, 4] },
] as const;

/** Position de mise en page d'un élément dans la planche (sans transformations). */
function layoutBox(el: HTMLElement, stage: HTMLElement) {
  let x = 0;
  let y = 0;
  for (let node: HTMLElement | null = el; node && node !== stage; node = node.offsetParent as HTMLElement | null) {
    x += node.offsetLeft;
    y += node.offsetTop;
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

export function DossierSequence() {
  const root = useRef<HTMLElement>(null);

  useGsap(
    ({ scope }) => {
      const q = gsap.utils.selector(scope);
      const stage = q(".seq__stage")[0] as HTMLElement | undefined;
      if (!stage) return;
      const mm = gsap.matchMedia();

      mm.add(MEDIA.motion, () => {
        const sheets = q(".seq__sheet") as HTMLElement[];
        const [avis, rc, cps] = sheets;
        const pieces = q(".seq__piece") as HTMLElement[];
        const folders = q(".seq__folder") as HTMLElement[];
        const phases = q(".seq__phase") as HTMLElement[];
        const W = () => stage.offsetWidth;
        const H = () => stage.offsetHeight;

        // Les pièces : d'abord hors champ, puis éparses, puis rangées (leur place CSS).
        const scatterX = (i: number) => (SCATTER[i]?.x ?? 0.5) * W() - layoutBox(pieces[i]!, stage).x - pieces[i]!.offsetWidth / 2;
        const scatterY = (i: number) => (SCATTER[i]?.y ?? 0.5) * H() - layoutBox(pieces[i]!, stage).y - pieces[i]!.offsetHeight / 2;
        const offX = (i: number) => scatterX(i) + ((SCATTER[i]?.x ?? 0.5) - 0.5) * W() * 1.6;
        const offY = (i: number) => scatterY(i) + ((SCATTER[i]?.y ?? 0.5) - 0.5) * H() * 1.8 + (i % 2 ? -1 : 1) * H() * 0.35;

        // Les trois documents de la consultation finissent en vignettes de référence, en haut à gauche
        // (origine des transformations au centre : on compense pour viser le coin).
        const refScale = 0.34;
        const refX = (el: HTMLElement, i: number) => {
          const box = layoutBox(el, stage);
          return i * (box.w * refScale + W() * 0.012) - box.x - (box.w * (1 - refScale)) / 2;
        };
        const refY = (el: HTMLElement) => {
          const box = layoutBox(el, stage);
          return H() * 0.015 - box.y - (box.h * (1 - refScale)) / 2;
        };

        gsap.set(phases.slice(1), { autoAlpha: 0, y: 24 });

        const tl = gsap.timeline({
          defaults: { ease: EASE.architect },
          scrollTrigger: { trigger: scope, start: "top 75%", end: "bottom bottom", scrub: 0.8, invalidateOnRefresh: true },
        });

        const caption = (i: number, at: number) => {
          tl.to(phases[i - 1] ?? [], { autoAlpha: 0, y: -24, duration: 0.4 }, at - 0.2).to(phases[i] ?? [], { autoAlpha: 1, y: 0, duration: 0.5 }, at);
        };

        // Le temps avance du premier au dernier instant : le dépôt arrive avant l'échéance.
        tl.fromTo(q(".seq__deadline-fill"), { scaleX: 0 }, { scaleX: 0.86, ease: EASE.linear, duration: 9.6 }, 0.2)
          .fromTo(q(".seq__deadline"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5 }, 0.3);

        // 1 — L'avis paraît.
        tl.fromTo(avis ?? [], { yPercent: 30, scale: 0.9, autoAlpha: 0 }, { yPercent: 0, scale: 1, autoAlpha: 1, duration: 0.9, ease: EASE.premium }, 0);

        // 2 — Le règlement et le cahier s'ouvrent ; les exigences sont surlignées.
        caption(1, 2);
        tl.to(avis ?? [], { yPercent: -16, scale: 0.86, duration: 1 }, 2)
          .fromTo(rc ?? [], { x: 0, rotation: 0, autoAlpha: 0 }, { x: () => -W() * 0.31, rotation: -3, autoAlpha: 1, duration: 1.1 }, 2.1)
          .fromTo(cps ?? [], { x: 0, rotation: 0, autoAlpha: 0 }, { x: () => W() * 0.31, rotation: 3, autoAlpha: 1, duration: 1.1 }, 2.1)
          .fromTo(q(".seq__hl"), { scaleX: 0 }, { scaleX: 1, duration: 0.5, stagger: 0.18, ease: EASE.out }, 3.1)
          .fromTo(q(".seq__mark"), { scale: 0, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.3, stagger: 0.18, ease: "back.out(2)" }, 3.2);

        // 3 — Les pièces affluent ; la consultation devient référence.
        caption(2, 4);
        sheets.forEach((el, i) => {
          tl.to(el, { x: () => refX(el, i), y: () => refY(el), yPercent: 0, scale: refScale, rotation: 0, duration: 1.1 }, 4);
        });
        tl.fromTo(
          pieces,
          { x: offX, y: offY, rotation: (i: number) => SCATTER[i]?.r ?? 0, autoAlpha: 0 },
          { x: scatterX, y: scatterY, autoAlpha: 1, duration: 1.2, stagger: 0.07, ease: EASE.premium },
          4.25,
        );

        // 4 — Chaque pièce trouve sa place.
        caption(3, 6);
        tl.fromTo(q(".seq__folder-frame"), { clipPath: "inset(100% 0% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.7, stagger: 0.12 }, 6)
          .fromTo(q(".seq__folder-tab"), { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.4, stagger: 0.12 }, 6.3)
          .to(pieces, { x: 0, y: 0, rotation: 0, duration: 1.2, stagger: 0.06 }, 6.45);

        // 5 — La revue passe, chaque pièce est cochée ; le dossier se ferme avant l'échéance.
        caption(4, 8);
        tl.fromTo(q(".seq__scan"), { x: 0, autoAlpha: 0 }, { x: () => W(), autoAlpha: 1, duration: 1.1, ease: EASE.linear }, 8)
          .to(q(".seq__scan"), { autoAlpha: 0, duration: 0.2 }, 9);
        folders.forEach((folder, f) => {
          tl.fromTo(folder.querySelectorAll(".seq__check path"), { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.25, stagger: 0.05, ease: EASE.out }, 8.12 + f * 0.33);
        });
        tl.to(q(".seq__folder-tab"), { autoAlpha: 0, duration: 0.4 }, 9.1)
          .to(folders[0] ?? [], { x: () => W() * 0.3, scale: 0.94, duration: 0.8 }, 9.1)
          .to(folders[2] ?? [], { x: () => -W() * 0.3, scale: 0.94, duration: 0.8 }, 9.1)
          .to(folders[1] ?? [], { scale: 0.94, duration: 0.8 }, 9.1)
          .fromTo(q(".seq__cover"), { yPercent: -18, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 0.7, ease: EASE.premium }, 9.35)
          .fromTo(q(".seq__deadline-mark"), { autoAlpha: 0.35 }, { autoAlpha: 1, duration: 0.3 }, 9.5)
          .to({}, { duration: 0.4 });
      });

      // Mouvement réduit : rien à animer, la mise en page statique est en CSS.
    },
    root,
  );

  return (
    <section ref={root} className="seq tone-2 has-grain" aria-labelledby="seq-title">
      <div className="seq__track">
        <div className="seq__sticky">
          <div className="seq__grid">
            <div className="seq__captions">
              <Tag>Le dossier</Tag>
              <h2 id="seq-title" className="visually-hidden">
                Comment une consultation devient un dossier déposé à temps
              </h2>
              <ol className="seq__phases">
                {SEQUENCE_PHASES.map((p) => (
                  <li key={p.title} className="seq__phase">
                    <p className="seq__title">{p.title}</p>
                    <p className="seq__text">{p.text}</p>
                  </li>
                ))}
              </ol>
            </div>

            <div className="seq__stage" aria-hidden="true">
              <div className="seq__deadline">
                <span className="label">Publication</span>
                <span className="seq__deadline-track">
                  <span className="seq__deadline-fill" />
                  <span className="seq__deadline-mark label">Dépôt</span>
                </span>
                <span className="label">Échéance</span>
              </div>

              {SEQUENCE_FOLDERS.map((folder, f) => (
                <div key={folder.title} className={`seq__folder seq__folder--${f}`}>
                  <span className="seq__folder-frame" />
                  <span className="seq__folder-tab label">
                    <span className="seq__tab-full">{folder.title}</span>
                    <span className="seq__tab-short">{folder.short}</span>
                  </span>
                  {folder.pieces.map((piece, s) => (
                    <div key={piece} className="seq__piece" style={{ "--slot": s } as CSSProperties}>
                      <span className="seq__piece-title">{piece}</span>
                      <span className="seq__piece-lines">
                        <i />
                        <i />
                      </span>
                      <span className="seq__check">
                        <svg viewBox="0 0 16 16">
                          <path pathLength={1} d="M3 8.6 6.4 12 13 4.4" />
                        </svg>
                      </span>
                    </div>
                  ))}
                </div>
              ))}

              {SHEETS.map((sheet) => (
                <div key={sheet.key} className={`seq__sheet seq__sheet--${sheet.key}`}>
                  <span className="seq__sheet-kicker label">{sheet.kicker}</span>
                  <span className="seq__sheet-title">{sheet.title}</span>
                  <span className="seq__sheet-lines">
                    {sheet.lines.map((w, i) => (
                      <i key={i} style={{ width: `${w}%` }}>
                        {"marks" in sheet && (sheet.marks as readonly number[]).includes(i) && (
                          <>
                            <b className="seq__hl" />
                            <b className="seq__mark" />
                          </>
                        )}
                      </i>
                    ))}
                  </span>
                  {sheet.key === "avis" && <span className="seq__sheet-tab label">Échéance</span>}
                </div>
              ))}

              <span className="seq__scan" />

              <div className="seq__cover">
                <svg className="seq__cover-arch" viewBox="0 0 200 240">
                  <path d={ARCH_OUTLINE} />
                </svg>
                <span className="label">Dossier de candidature</span>
                <span className="seq__cover-title">Prêt au dépôt.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
