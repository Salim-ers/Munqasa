/**
 * Révélations déclaratives : les composants posent un attribut, la page
 * appelle `applyReveals(scope)` une fois. Chaque mouvement a un sens :
 * une ligne apparaît comme on lit, une image s'ouvre comme un volet.
 *
 *   data-reveal="lines"   titre révélé ligne à ligne (masque)
 *   data-reveal="fade"    léger glissement vertical + fondu
 *   data-reveal="image"   ouverture par le bas (clip-path) + dézoom
 *   data-reveal="rule"    filet qui se trace de gauche à droite
 *   data-reveal-delay="0.2"
 *
 * Avec prefers-reduced-motion : fondus courts uniquement.
 */
import { EASE, gsap, ScrollTrigger, SplitText } from "./gsap";

const START = "top 86%";

function delayOf(el: Element): number {
  return Number((el as HTMLElement).dataset.revealDelay ?? 0);
}

function revealLines(el: HTMLElement) {
  SplitText.create(el, {
    type: "lines",
    mask: "lines",
    linesClass: "split-line",
    autoSplit: true,
    onSplit: (self: SplitText) =>
      gsap.from(self.lines, {
        yPercent: 120,
        duration: 1.15,
        ease: EASE.premium,
        stagger: 0.085,
        delay: delayOf(el),
        scrollTrigger: { trigger: el, start: START, once: true },
      }),
  });
}

function revealFade(el: HTMLElement) {
  gsap.from(el, {
    y: 28,
    autoAlpha: 0,
    duration: 1,
    ease: EASE.premium,
    delay: delayOf(el),
    scrollTrigger: { trigger: el, start: START, once: true },
  });
}

function revealImage(el: HTMLElement) {
  const media = el.querySelector("img");
  const tl = gsap.timeline({ delay: delayOf(el), scrollTrigger: { trigger: el, start: "top 90%", once: true } });
  tl.fromTo(el, { clipPath: "inset(100% 0% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 1.3, ease: EASE.architect });
  if (media) tl.fromTo(media, { scale: 1.18 }, { scale: 1, duration: 1.6, ease: EASE.premium }, 0);
}

function revealRule(el: HTMLElement) {
  gsap.fromTo(
    el,
    { scaleX: 0, transformOrigin: "0% 50%" },
    { scaleX: 1, duration: 1.2, ease: EASE.architect, delay: delayOf(el), scrollTrigger: { trigger: el, start: START, once: true } },
  );
}

function revealReduced(el: HTMLElement) {
  gsap.from(el, {
    autoAlpha: 0,
    duration: 0.5,
    ease: EASE.linear,
    scrollTrigger: { trigger: el, start: START, once: true },
  });
}

/** À appeler dans un gsap.context (voir useGsap) : le nettoyage est automatique. */
export function applyReveals(scope: HTMLElement, reduced: boolean) {
  scope.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => {
    if (reduced) return revealReduced(el);
    switch (el.dataset.reveal) {
      case "lines":
        return revealLines(el);
      case "image":
        return revealImage(el);
      case "rule":
        return revealRule(el);
      default:
        return revealFade(el);
    }
  });
}

/** Recalcule les déclencheurs quand la mise en page bouge (polices, images). */
export function refreshScroll() {
  ScrollTrigger.refresh();
}
