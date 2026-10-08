import sources from "../../image-sources.json";
import { TransitionLink } from "../components/TransitionLink/TransitionLink";
import { LegalLayout, ToComplete } from "../sections/shared/LegalLayout";

export default function MentionsLegales() {
  return (
    <LegalLayout tag="Légal" title="Mentions légales">
      <h2>Éditeur du site</h2>
      <dl>
        <dt>Nom commercial</dt>
        <dd>Talab Solutions</dd>
        <dt>Raison sociale</dt>
        <dd>
          <ToComplete>Raison sociale et forme juridique</ToComplete>
        </dd>
        <dt>Siège social</dt>
        <dd>
          <ToComplete>Adresse</ToComplete>
        </dd>
        <dt>Immatriculation</dt>
        <dd>
          <ToComplete>RC, ICE, IF</ToComplete>
        </dd>
        <dt>Directeur de la publication</dt>
        <dd>
          <ToComplete>Nom</ToComplete>
        </dd>
        <dt>Contact</dt>
        <dd>
          <TransitionLink to="/contact">Formulaire de contact</TransitionLink>
        </dd>
      </dl>

      <h2>Hébergement</h2>
      <p>
        <ToComplete>Nom, adresse et coordonnées de l’hébergeur</ToComplete>
      </p>

      <h2>Propriété intellectuelle</h2>
      <p>
        Le nom Talab Solutions, son logo, les textes et la mise en page de ce site sont protégés. Toute reproduction, totale ou
        partielle, sans autorisation écrite préalable est interdite.
      </p>
      <p>
        Les photographies sont utilisées sous la licence Unsplash (
        <a href="https://unsplash.com/license" rel="noopener noreferrer" target="_blank">
          unsplash.com/license
        </a>
        ). Crédits :
      </p>
      <ul>
        {sources.map((s) => (
          <li key={s.originalUrl}>
            <a href={s.originalUrl} rel="noopener noreferrer" target="_blank">
              {s.photographer}
            </a>
            , Unsplash
          </li>
        ))}
      </ul>

      <h2>Responsabilité</h2>
      <p>
        Les informations publiées sur ce site sont fournies à titre indicatif. Elles décrivent la nature de
        l’accompagnement proposé et ne constituent ni un engagement de résultat, ni un conseil juridique.
      </p>

      <h2>Droit applicable</h2>
      <p>Le présent site et ses mentions sont régis par le droit marocain.</p>
    </LegalLayout>
  );
}
