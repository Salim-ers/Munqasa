import { TransitionLink } from "../components/TransitionLink/TransitionLink";
import { LegalLayout, ToComplete } from "../sections/shared/LegalLayout";

export default function PolitiqueConfidentialite() {
  return (
    <LegalLayout tag="Légal" title="Politique de confidentialité">
      <p>
        Cette politique décrit l’usage des informations transmises via le site MUNAQASA, conformément à la loi n° 09-08
        relative à la protection des personnes physiques à l’égard du traitement des données à caractère personnel.
      </p>

      <h2>Responsable du traitement</h2>
      <p>
        MUNAQASA — <ToComplete>raison sociale et adresse</ToComplete>. Numéro de déclaration ou d’autorisation auprès de la
        CNDP : <ToComplete>numéro</ToComplete>.
      </p>

      <h2>Données collectées</h2>
      <p>Le formulaire de contact recueille uniquement les informations que vous saisissez :</p>
      <ul>
        <li>nom complet, entreprise, adresse e-mail et, si vous le souhaitez, numéro de téléphone ;</li>
        <li>type de consultation, référence, date limite et besoins sélectionnés ;</li>
        <li>le contenu de votre message.</li>
      </ul>
      <p>
        Aucun fichier ne peut être joint au formulaire. Ne transmettez pas de pièce confidentielle par ce biais : les
        documents d’un dossier sont échangés ensuite, par un canal convenu ensemble.
      </p>

      <h2>Finalité et base légale</h2>
      <p>
        Ces données servent exclusivement à répondre à votre demande et à échanger sur l’accompagnement envisagé. Le
        traitement repose sur votre consentement, exprimé en cochant la case prévue avant l’envoi. Elles ne sont ni vendues,
        ni cédées, ni utilisées à des fins de prospection sans votre accord.
      </p>

      <h2>Destinataires</h2>
      <p>
        Les demandes sont transmises à MUNAQASA par e-mail, via un prestataire technique d’envoi agissant pour son compte.
        Aucune autre transmission n’a lieu.
      </p>

      <h2>Durée de conservation</h2>
      <p>
        Les données sont conservées le temps nécessaire au traitement de votre demande et, le cas échéant, à la relation qui
        en découle, puis supprimées.
      </p>

      <h2>Vos droits</h2>
      <p>
        Vous disposez d’un droit d’accès, de rectification et d’opposition pour motif légitime. Pour l’exercer, écrivez-nous
        via le <TransitionLink to="/contact">formulaire de contact</TransitionLink>. Vous pouvez également saisir la
        Commission nationale de contrôle de la protection des données à caractère personnel (CNDP).
      </p>

      <h2>Cookies et stockage local</h2>
      <p>
        Ce site n’utilise ni cookie publicitaire, ni outil de mesure d’audience, ni traceur tiers. Deux préférences
        techniques peuvent être enregistrées dans votre navigateur : la lumière choisie pour la photographie d’accueil (jour
        ou nuit) et le fait que l’animation d’ouverture a déjà été vue. Elles ne quittent pas votre appareil.
      </p>

      <h2>Sécurité</h2>
      <p>
        Les échanges sont chiffrés (HTTPS). Les demandes sont validées côté serveur et protégées contre les envois
        automatisés.
      </p>
    </LegalLayout>
  );
}
