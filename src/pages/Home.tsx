import { usePageReveals } from "../hooks/usePageReveals";
import { Checklist } from "../sections/home/Checklist";
import { Formulas } from "../sections/home/Formulas";
import { Hero } from "../sections/home/Hero";
import { Immersive } from "../sections/home/Immersive";
import { Manifesto } from "../sections/home/Manifesto";
import { MethodSticky } from "../sections/home/MethodSticky";
import { Problem } from "../sections/home/Problem";
import { ServicesMosaic } from "../sections/home/ServicesMosaic";
import { FinalCta } from "../sections/shared/FinalCta";

/**
 * Accueil — la journée avance avec le défilement :
 * jour (hero) → ivoire → pierre → crépuscule → nuit → encre.
 */
export default function Home() {
  const ref = usePageReveals();
  return (
    <div ref={ref}>
      <Hero />
      <Manifesto />
      <Problem />
      <ServicesMosaic />
      <MethodSticky />
      <Checklist />
      <Immersive />
      <Formulas />
      <FinalCta />
    </div>
  );
}
