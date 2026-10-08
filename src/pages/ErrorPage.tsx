import { ArrowRight, RotateCw } from "lucide-react";
import { Tag } from "../components/Tag/Tag";
import "./NotFound.css";

/**
 * Affichée si une page ne peut pas s'afficher (incident inattendu, fichier introuvable après une
 * mise à jour du site) : à la place du message technique du routeur, une page sobre et deux issues.
 * Volontairement autonome (liens simples, aucune animation) pour s'afficher en toutes circonstances.
 */
export default function ErrorPage() {
  return (
    <main className="not-found tone-1 has-grain" aria-labelledby="page-title">
      <div className="not-found__inner container">
        <Tag>Incident</Tag>
        <h1 id="page-title" className="display-xl">
          Affichage <em>interrompu.</em>
        </h1>
        <p className="lead not-found__text">Un incident a empêché l’affichage de cette page. Rechargez-la, ou revenez à l’accueil.</p>
        <div className="not-found__actions">
          <button type="button" className="cta cta--solid" onClick={() => window.location.reload()}>
            <span className="cta__label">Recharger la page</span>
            <span className="cta__icon" aria-hidden="true">
              <RotateCw size={16} strokeWidth={1.5} />
            </span>
          </button>
          <a className="cta cta--text" href="/">
            <span className="cta__label">Retour à l’accueil</span>
            <span className="cta__icon" aria-hidden="true">
              <ArrowRight size={16} strokeWidth={1.5} />
            </span>
          </a>
        </div>
      </div>
    </main>
  );
}
