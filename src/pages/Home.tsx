import { usePageReveals } from "../hooks/usePageReveals";
import { DossierSequence } from "../sections/home/DossierSequence";
import { Formulas } from "../sections/home/Formulas";
import { Hero } from "../sections/home/Hero";
import { Immersive } from "../sections/home/Immersive";
import { ServicesIndex } from "../sections/home/ServicesIndex";

/**
 * Accueil : une idée par section, aucune redite.
 * Le hero pose la promesse, la séquence la démontre, l'index montre l'étendue,
 * la photographie donne l'ambiance, les formules ouvrent la discussion.
 */
export default function Home() {
  const ref = usePageReveals();
  return (
    <div ref={ref}>
      <Hero />
      <DossierSequence />
      <ServicesIndex />
      <Immersive />
      <Formulas />
    </div>
  );
}
