import { useRef, type CSSProperties } from "react";
import { EASE, gsap } from "../../animations/gsap";
import type { ServiceSlug } from "../../data/services";
import { useGsap } from "../../hooks/useGsap";
import "./ServiceScene.css";

/**
 * Scènes animées de la page Services : chaque service est montré en action,
 * avec le langage des documents (avis, pièces, tampons, cases, plis).
 *
 * Règle d'animation : le CSS « naturel » décrit l'état final (affiché tel quel
 * avec prefers-reduced-motion), le CSS sous `no-preference` décrit l'état de
 * départ, et le défilement fait passer de l'un à l'autre.
 */

export type SceneKind = ServiceSlug;

type Q = (selector: string) => HTMLElement[];
type Builder = (tl: gsap.core.Timeline, q: Q, root: HTMLElement) => void;

/* ---------- Éléments communs ---------- */

function Check() {
  return (
    <span className="sc-check">
      <svg viewBox="0 0 16 16">
        <path pathLength={1} d="M3 8.6 6.4 12 13 4.4" />
      </svg>
    </span>
  );
}

function Lines({ widths, className }: { widths: number[]; className?: string }) {
  return (
    <span className={["sc-lines", className].filter(Boolean).join(" ")}>
      {widths.map((w, i) => (
        <i key={i} style={{ width: `${w}%` }} />
      ))}
    </span>
  );
}

const slot = (i: number) => ({ "--i": i }) as CSSProperties;

/* ---------- Veille : les avis défilent, les critères retiennent les bons ---------- */

const NOTICES = [
  { title: "Construction d’un équipement public", match: true },
  { title: "Fourniture de matériel informatique", match: false },
  { title: "Réhabilitation d’un bâtiment administratif", match: true },
  { title: "Entretien des espaces verts", match: false },
  { title: "Étude technique d’aménagement", match: true },
];

function Veille() {
  return (
    <div className="sc__body sv">
      <div className="sv-feed">
        <span className="sc-label">Avis publiés</span>
        <div className="sv-list">
          {NOTICES.map((n) => (
            <div key={n.title} className={`sc-paper sv-card${n.match ? " is-match" : ""}`}>
              <span className="sv-mark" />
              <span className="sc-title">{n.title}</span>
              <Lines widths={[78, 52]} />
              {n.match && <span className="sv-badge">Retenu</span>}
            </div>
          ))}
          <span className="sv-scan">
            <span className="sc-label">Vos critères</span>
          </span>
        </div>
      </div>
      <div className="sv-picks">
        <span className="sc-label">Votre sélection</span>
        {NOTICES.filter((n) => n.match).map((n) => (
          <div key={n.title} className="sc-paper sv-pick">
            <span className="sc-title">{n.title}</span>
            <Check />
          </div>
        ))}
      </div>
    </div>
  );
}

const veille: Builder = (tl, q) => {
  const cards = q(".sv-card");
  const picks = q(".sv-pick");
  const scan = q(".sv-scan");
  const first = cards[0];
  if (!first) return;
  let pick = 0;
  tl.to(scan, { autoAlpha: 1, duration: 0.3 }, 0);
  cards.forEach((card, i) => {
    const at = 0.4 + i * 1.1;
    tl.to(scan, { y: () => card.offsetTop - first.offsetTop, duration: 0.5, ease: EASE.architect }, at);
    if (card.classList.contains("is-match")) {
      const target = picks[pick++];
      tl.to(card.querySelector(".sv-mark"), { scaleY: 1, duration: 0.3 }, at + 0.45)
        .to(card.querySelector(".sv-badge"), { autoAlpha: 1, scale: 1, duration: 0.3, ease: "back.out(2)" }, at + 0.5);
      if (target) {
        tl.to(target, { autoAlpha: 1, x: 0, duration: 0.6, ease: EASE.premium }, at + 0.55).to(
          target.querySelector(".sc-check path"),
          { strokeDashoffset: 0, duration: 0.3 },
          at + 0.85,
        );
      }
    } else {
      tl.to(card, { opacity: 0.38, duration: 0.3 }, at + 0.45);
    }
  });
  tl.to(scan, { autoAlpha: 0, duration: 0.3 }, 0.4 + cards.length * 1.1);
};

/* ---------- Analyse : la lecture surligne, la grille se remplit ---------- */

const ANALYSE_LINES = [92, 78, 88, 70, 95, 84, 66, 90, 82, 74, 88, 60];
const REQS = [
  { line: 2, tag: "Pièce exigée", row: "Pièces exigées" },
  { line: 5, tag: "Format imposé", row: "Formats imposés" },
  { line: 8, tag: "Critère", row: "Critères d’évaluation" },
  { line: 10, tag: "Date", row: "Calendrier" },
];
const READ_DURATION = 8;

function Analyse() {
  return (
    <div className="sc__body sa">
      <div className="sc-paper sa-doc">
        <span className="sc-kicker">Règlement de consultation</span>
        <span className="sa-lines">
          {ANALYSE_LINES.map((w, i) => {
            const req = REQS.find((r) => r.line === i);
            return (
              <i key={i} style={{ width: `${w}%` }} className={req ? "is-req" : undefined}>
                {req && (
                  <>
                    <b className="sa-hl" />
                    <b className="sa-tag">{req.tag}</b>
                  </>
                )}
              </i>
            );
          })}
          <span className="sa-reader" />
        </span>
      </div>
      <div className="sa-grid">
        <span className="sc-label">Grille d’analyse</span>
        {REQS.map((r) => (
          <div key={r.row} className="sa-row">
            <span className="sa-fill" />
            <span className="sa-row-label">{r.row}</span>
            <Check />
          </div>
        ))}
      </div>
    </div>
  );
}

const analyse: Builder = (tl, q) => {
  const lines = q(".sa-lines")[0];
  const reqLines = q(".sa-lines i.is-req");
  const rows = q(".sa-row");
  if (!lines) return;
  tl.to(q(".sa-reader"), { autoAlpha: 1, duration: 0.2 }, 0).to(
    q(".sa-reader"),
    { y: () => lines.offsetHeight, duration: READ_DURATION, ease: EASE.linear },
    0,
  );
  reqLines.forEach((line, k) => {
    const at = (((REQS[k]?.line ?? 0) + 0.5) / ANALYSE_LINES.length) * READ_DURATION;
    const row = rows[k];
    tl.to(line.querySelector(".sa-hl"), { scaleX: 1, duration: 0.5, ease: EASE.out }, at).to(
      line.querySelector(".sa-tag"),
      { autoAlpha: 1, y: 0, duration: 0.3 },
      at + 0.1,
    );
    if (row) {
      tl.to(row.querySelector(".sa-fill"), { scaleX: 1, duration: 0.5 }, at + 0.2).to(
        row.querySelector(".sc-check path"),
        { strokeDashoffset: 0, duration: 0.3 },
        at + 0.45,
      );
    }
  });
  tl.to(q(".sa-reader"), { autoAlpha: 0, duration: 0.3 }, READ_DURATION);
};

/* ---------- Dossier administratif : chaque pièce est vérifiée, la périmée remplacée ---------- */

const ATTESTATIONS = ["Attestation fiscale", "Attestation CNSS", "Registre de commerce", "Caution provisoire"];

function Admin() {
  return (
    <div className="sc__body sd">
      <span className="sd-back" />
      <div className="sd-pile">
        {ATTESTATIONS.map((t, i) => (
          <div key={t} className={`sc-paper sd-card${i === 2 ? " sd-card--fresh" : ""}`} style={slot(i)}>
            <span className="sc-title">{t}</span>
            <Lines widths={[84, 66, 46]} />
            <span className="sc-stamp sd-stamp">Valide</span>
          </div>
        ))}
        <div className="sc-paper sd-card sd-card--expired" style={slot(2)}>
          <span className="sc-title">Registre de commerce</span>
          <Lines widths={[84, 66, 46]} />
          <span className="sc-stamp sd-stamp sd-stamp--expired">Expirée</span>
        </div>
      </div>
      <span className="sd-front">
        <span className="sc-label">Dossier administratif</span>
      </span>
    </div>
  );
}

const admin: Builder = (tl, q, root) => {
  const cards = q(".sd-card:not(.sd-card--expired)");
  const expired = q(".sd-card--expired")[0];
  const drop = (card: HTMLElement | undefined, at: number) => {
    if (!card) return;
    tl.to(card, { y: 0, rotation: 0, autoAlpha: 1, duration: 0.7, ease: EASE.premium }, at).to(
      card.querySelector(".sd-stamp"),
      { autoAlpha: 1, scale: 1, duration: 0.35, ease: "back.out(2.4)" },
      at + 0.55,
    );
  };
  drop(cards[0], 0);
  drop(cards[1], 1);
  drop(expired, 2);
  if (expired) {
    tl.to(expired, { x: () => root.clientWidth * 0.75, rotation: 9, autoAlpha: 0, duration: 0.7, ease: EASE.architect }, 3.4);
  }
  drop(cards[2], 3.6);
  drop(cards[3], 4.8);
  tl.to(q(".sd-front"), { y: 0, autoAlpha: 1, duration: 0.8, ease: EASE.architect }, 6);
};

/* ---------- Offre technique : chaque critère trouve sa réponse ---------- */

const CRITERIA = [
  { label: "Méthodologie", kind: "lines" },
  { label: "Moyens humains", kind: "lines" },
  { label: "Moyens matériels", kind: "bars" },
  { label: "Références", kind: "tiles" },
] as const;

function Offre() {
  return (
    <div className="sc__body so">
      <span className="sc-paper so-paper" />
      <div className="so-grid so-heads">
        <span className="sc-label">Critères d’évaluation</span>
        <span />
        <span className="sc-kicker so-head-r">Offre technique</span>
      </div>
      {CRITERIA.map((c) => (
        <div key={c.label} className="so-grid so-row">
          <span className="so-crit">
            {c.label}
            <span className="so-underline" />
          </span>
          <span className="so-link" />
          <div className="so-sec">
            <span className="so-sec-title">{c.label}</span>
            {c.kind === "lines" && <Lines widths={[90, 74, 58]} className="so-fill" />}
            {c.kind === "bars" && (
              <span className="so-bars so-fill">
                {[58, 84, 42, 70, 92].map((h, b) => (
                  <i key={b} style={{ height: `${h}%` }} />
                ))}
              </span>
            )}
            {c.kind === "tiles" && (
              <span className="so-tiles so-fill">
                <i />
                <i />
                <i />
              </span>
            )}
          </div>
        </div>
      ))}
      <span className="sc-stamp so-stamp">Prête à valider</span>
    </div>
  );
}

const offre: Builder = (tl, q) => {
  q(".so-row").forEach((row, i) => {
    const at = i * 1.4;
    tl.to(row.querySelector(".so-crit"), { opacity: 1, duration: 0.3 }, at)
      .to(row.querySelector(".so-underline"), { scaleX: 1, duration: 0.4 }, at)
      .to(row.querySelector(".so-link"), { scaleX: 1, duration: 0.5, ease: EASE.architect }, at + 0.2)
      .to(row.querySelector(".so-sec"), { autoAlpha: 1, x: 0, duration: 0.5, ease: EASE.premium }, at + 0.55);
    const fill = row.querySelector(".so-fill");
    if (fill) tl.to(fill.children, { scaleX: 1, scaleY: 1, duration: 0.5, stagger: 0.06, ease: EASE.out }, at + 0.8);
  });
  tl.to(q(".so-stamp"), { autoAlpha: 1, scale: 1, duration: 0.4, ease: "back.out(2.4)" }, 6);
};

/* ---------- Coordination : les contributions convergent vers le dossier ---------- */

const CONTRIBUTORS = [
  { label: "Direction", x: 0.16, y: 0.2 },
  { label: "Bureau d’études", x: 0.84, y: 0.2 },
  { label: "Comptabilité", x: 0.16, y: 0.8 },
  { label: "Partenaires", x: 0.84, y: 0.8 },
];

function Coordination() {
  return (
    <div className="sc__body sk-coord">
      {/* viewBox au ratio exact de la zone utile (90 × 70) : traits non déformés */}
      <svg className="cd-links" viewBox="0 0 90 70">
        {CONTRIBUTORS.map((c) => (
          <path key={c.label} pathLength={1} d={`M${c.x * 90} ${c.y * 70} L45 35`} />
        ))}
      </svg>
      {CONTRIBUTORS.map((c) => (
        <div key={c.label} className="cd-node" style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}>
          <span className="sc-label cd-name">{c.label}</span>
          <span className="sc-paper cd-chip">
            <Lines widths={[80, 56]} />
          </span>
          <span className="cd-done">
            <Check />
          </span>
        </div>
      ))}
      <div className="sc-paper cd-hub">
        <span className="cd-tab">Dossier</span>
        <span className="sc-kicker">Pièces reçues</span>
        <span className="cd-progress">
          <span className="cd-progress-fill" />
        </span>
        <span className="cd-complete">Tout est remis</span>
      </div>
    </div>
  );
}

const coordination: Builder = (tl, q) => {
  const nodes = q(".cd-node");
  const body = q(".sc__body")[0];
  if (!body) return;
  tl.to(q(".cd-links path"), { strokeDashoffset: 0, duration: 0.8, stagger: 0.15, ease: EASE.architect }, 0);
  nodes.forEach((node, i) => {
    const c = CONTRIBUTORS[i];
    if (!c) return;
    const at = 1 + i * 1.2;
    tl.to(
      node.querySelector(".cd-chip"),
      { x: () => body.clientWidth * (0.5 - c.x), y: () => body.clientHeight * (0.5 - c.y), scale: 0.5, autoAlpha: 0, duration: 0.9, ease: EASE.architect },
      at,
    )
      .to(q(".cd-progress-fill"), { scaleX: (i + 1) / nodes.length, duration: 0.4, ease: EASE.out }, at + 0.75)
      .to(node.querySelector(".cd-done"), { autoAlpha: 1, duration: 0.2 }, at + 0.8)
      .to(node.querySelector(".cd-done path"), { strokeDashoffset: 0, duration: 0.3 }, at + 0.85);
  });
  tl.to(q(".cd-complete"), { autoAlpha: 1, y: 0, duration: 0.4 }, 1 + nodes.length * 1.2);
};

/* ---------- Contrôle : la revue passe, un écart est corrigé avant l'échéance ---------- */

const CONTROL_ROWS = [
  { label: "Pièces administratives" },
  { label: "Signatures et cachets", gap: true },
  { label: "Versions des documents" },
  { label: "Formats demandés" },
  { label: "Respect de l’échéance" },
];

function Controle() {
  return (
    <div className="sc__body sk">
      <div className="sc-paper sk-sheet">
        <span className="sc-kicker">Revue avant dépôt</span>
        <div className="sk-rows">
          {CONTROL_ROWS.map((r) => (
            <div key={r.label} className={`sk-row${r.gap ? " has-gap" : ""}`}>
              <span className="sk-row-tint" />
              <span className="sk-row-label">{r.label}</span>
              {r.gap && (
                <span className="sk-status">
                  <b className="sk-gap">Écart</b>
                  <b className="sk-fixed">Corrigé</b>
                </span>
              )}
              <Check />
            </div>
          ))}
          <span className="sk-scan" />
        </div>
      </div>
      <span className="sc-stamp sk-stamp">Revue terminée</span>
    </div>
  );
}

const controle: Builder = (tl, q) => {
  const rows = q(".sk-row");
  const first = rows[0];
  if (!first) return;
  let at = 0.3;
  tl.to(q(".sk-scan"), { autoAlpha: 1, duration: 0.2 }, 0);
  rows.forEach((row) => {
    tl.to(q(".sk-scan"), { y: () => row.offsetTop - first.offsetTop, duration: 0.45, ease: EASE.architect }, at);
    if (row.classList.contains("has-gap")) {
      tl.to(row.querySelector(".sk-row-tint"), { autoAlpha: 1, duration: 0.25 }, at + 0.4)
        .to(row.querySelector(".sk-gap"), { autoAlpha: 1, duration: 0.25 }, at + 0.4)
        .to(row.querySelector(".sk-gap"), { autoAlpha: 0, duration: 0.25 }, at + 1.3)
        .to(row.querySelector(".sk-row-tint"), { autoAlpha: 0, duration: 0.3 }, at + 1.3)
        .to(row.querySelector(".sk-fixed"), { autoAlpha: 1, duration: 0.25 }, at + 1.45)
        .to(row.querySelector(".sc-check path"), { strokeDashoffset: 0, duration: 0.3 }, at + 1.5);
      at += 1.9;
    } else {
      tl.to(row.querySelector(".sc-check path"), { strokeDashoffset: 0, duration: 0.3 }, at + 0.4);
      at += 0.8;
    }
  });
  tl.to(q(".sk-scan"), { autoAlpha: 0, duration: 0.25 }, at).to(
    q(".sk-stamp"),
    { autoAlpha: 1, scale: 1, duration: 0.4, ease: "back.out(2.4)" },
    at + 0.2,
  );
};

/* ---------- Soumission : l'arborescence se construit, le pli se ferme ---------- */

const TREE = [
  { folder: "Administratif", files: ["Attestation_fiscale.pdf", "Attestation_CNSS.pdf", "Caution_provisoire.pdf"] },
  { folder: "Technique", files: ["Moyens_humains.pdf", "References.pdf"] },
  { folder: "Offre", files: ["Note_methodologique.pdf", "Planning.pdf"] },
];

function Soumission() {
  return (
    <div className="sc__body sp">
      <div className="sp-tree">
        <span className="sp-item sp-root">
          <span className="sp-folder" />
          Dossier de candidature
        </span>
        {TREE.map((g) => (
          <div key={g.folder} className="sp-group">
            <span className="sp-item sp-dir">
              <span className="sp-folder" />
              {g.folder}
            </span>
            {g.files.map((f) => (
              <span key={f} className="sp-item sp-file">
                <span className="sp-doc" />
                <span className="sp-name">{f}</span>
                <span className="sp-badge">PDF</span>
              </span>
            ))}
          </div>
        ))}
      </div>
      <div className="sp-pli">
        <span className="sc-paper sp-env">
          <svg className="sp-env-lines" viewBox="0 0 145 100" preserveAspectRatio="none">
            <path d="M0 100 L72.5 50 L145 100" />
          </svg>
          <span className="sp-flap sp-flap--open" />
          <span className="sp-flap sp-flap--closed" />
        </span>
        <span className="sc-stamp sp-seal">Prêt au dépôt</span>
      </div>
    </div>
  );
}

const soumission: Builder = (tl, q) => {
  tl.to(q(".sp-item"), { autoAlpha: 1, x: 0, duration: 0.45, stagger: 0.28, ease: EASE.premium }, 0).to(
    q(".sp-badge"),
    { autoAlpha: 1, scale: 1, duration: 0.25, stagger: 0.12, ease: "back.out(2)" },
    1.6,
  );
  tl.to(q(".sp-env"), { autoAlpha: 1, y: 0, duration: 0.6, ease: EASE.premium }, 3.6)
    .to(q(".sp-flap--open"), { scaleY: 0, duration: 0.35, ease: "power2.in" }, 4.4)
    .to(q(".sp-flap--closed"), { scaleY: 1, duration: 0.4, ease: "power2.out" }, 4.75)
    .to(q(".sp-seal"), { autoAlpha: 1, scale: 1, duration: 0.4, ease: "back.out(2.4)" }, 5.1);
};

/* ---------- Suivi : la consultation continue après le dépôt ---------- */

const MILESTONES = [
  { label: "Dépôt" },
  { label: "Additif", event: "Additif publié : date reportée" },
  { label: "Ouverture des plis" },
  { label: "Compléments", event: "Compléments demandés" },
  { label: "Résultat", event: "Résultat publié" },
];

function Suivi() {
  return (
    <div className="sc__body su">
      <div className="su-line">
        <span className="su-track">
          <span className="su-fill" />
        </span>
        {MILESTONES.map((m, i) => (
          <div key={m.label} className="su-step" style={slot(i)}>
            <span className="su-tick">
              <span className="su-tick-on" />
            </span>
            <span className="sc-label su-step-label">{m.label}</span>
            {m.event && <span className="sc-paper su-event">{m.event}</span>}
          </div>
        ))}
      </div>
      <div className="su-history">
        <span className="sc-label">Historique du dossier</span>
        {MILESTONES.filter((m) => m.event).map((m) => (
          <span key={m.label} className="su-row">
            {m.event}
          </span>
        ))}
        <span className="su-row su-row--last">Dossier archivé</span>
      </div>
    </div>
  );
}

const suivi: Builder = (tl, q) => {
  const steps = q(".su-step");
  const rows = q(".su-row");
  const D = 6;
  tl.to(q(".su-fill"), { scaleX: 1, duration: D, ease: EASE.linear }, 0);
  let row = 0;
  steps.forEach((step, i) => {
    const at = (i / (steps.length - 1)) * D;
    tl.to(step.querySelector(".su-tick-on"), { scaleY: 1, duration: 0.25 }, at).to(step.querySelector(".su-step-label"), { opacity: 1, duration: 0.25 }, at);
    const event = step.querySelector(".su-event");
    if (event) {
      tl.to(event, { autoAlpha: 1, y: 0, duration: 0.45, ease: EASE.premium }, at + 0.1);
      const r = rows[row++];
      if (r) tl.to(r, { autoAlpha: 1, x: 0, duration: 0.4 }, at + 0.4);
    }
  });
  const last = rows[row];
  if (last) tl.to(last, { autoAlpha: 1, x: 0, duration: 0.4 }, D + 0.3);
};

/* ---------- Assemblage ---------- */

const SCENES: Record<SceneKind, { View: () => React.JSX.Element; build: Builder; label: string }> = {
  veille: { View: Veille, build: veille, label: "Les avis publiés passent au crible de vos critères." },
  analyse: { View: Analyse, build: analyse, label: "Le règlement est lu ligne à ligne, chaque exigence rejoint la grille d’analyse." },
  "dossier-administratif": { View: Admin, build: admin, label: "Chaque attestation est vérifiée, la pièce périmée est remplacée." },
  "offre-technique": { View: Offre, build: offre, label: "Chaque critère d’évaluation reçoit sa réponse dans l’offre." },
  coordination: { View: Coordination, build: coordination, label: "Les contributions de chaque intervenant convergent vers le dossier." },
  controle: { View: Controle, build: controle, label: "La revue passe chaque pièce, l’écart est corrigé avant l’échéance." },
  soumission: { View: Soumission, build: soumission, label: "Les fichiers sont nommés et rangés, le pli est fermé." },
  suivi: { View: Suivi, build: suivi, label: "Après le dépôt, chaque événement est suivi puis archivé." },
};

export function ServiceScene({ kind }: { kind: SceneKind }) {
  const root = useRef<HTMLDivElement>(null);
  const scene = SCENES[kind];

  useGsap(
    ({ reduced, scope }) => {
      if (reduced) return;
      const q: Q = (selector) => Array.from(scope.querySelectorAll<HTMLElement>(selector));
      const tl = gsap.timeline({
        defaults: { ease: EASE.out },
        scrollTrigger: { trigger: scope, start: "top 85%", end: "center 45%", scrub: 0.6, invalidateOnRefresh: true },
      });
      scene.build(tl, q, scope);
    },
    root,
    [kind],
  );

  return (
    <div ref={root} className={`sc sc--${kind}`} role="img" aria-label={scene.label}>
      <scene.View />
    </div>
  );
}
