import { ArrowUp } from "lucide-react";
import { LEGAL_NAV, NAV } from "../../data/navigation";
import { SERVICES } from "../../data/services";
import { site } from "../../data/site";
import { useReducedMotion } from "../../hooks/useMediaQuery";
import { scrollToTop } from "../../lib/scroll";
import { CtaLink } from "../CtaLink/CtaLink";
import { Tag } from "../Tag/Tag";
import { TransitionLink } from "../TransitionLink/TransitionLink";
import "./Footer.css";

export function Footer() {
  const reduced = useReducedMotion();
  const year = new Date().getFullYear();

  return (
    <footer className="footer surface-night has-grain" data-surface="dark">
      <div className="footer__top container">
        <div className="footer__intro">
          <Tag dot>Appels d’offres · Maroc</Tag>
          <p className="footer__statement display-sm">
            De l’avis <em>à la soumission.</em>
          </p>
        </div>
        <CtaLink to="/contact">Confier un dossier</CtaLink>
      </div>

      <div className="footer__cols container">
        <nav className="footer__col" aria-label="Navigation du pied de page">
          <h2 className="footer__title label">Navigation</h2>
          <ul>
            {NAV.map((item) => (
              <li key={item.to}>
                <TransitionLink to={item.to}>{item.label}</TransitionLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="footer__col">
          <h2 className="footer__title label">Services</h2>
          <ul>
            {SERVICES.map((s) => (
              <li key={s.slug}>
                <TransitionLink to={`/services#${s.slug}`}>{s.title}</TransitionLink>
              </li>
            ))}
          </ul>
        </div>
        <div className="footer__col">
          <h2 className="footer__title label">Contact</h2>
          <ul>
            <li>
              <TransitionLink to="/contact">Formulaire de demande</TransitionLink>
            </li>
            {site.contact.email && (
              <li>
                <a href={`mailto:${site.contact.email}`}>{site.contact.email}</a>
              </li>
            )}
            {site.contact.phone && (
              <li>
                <a href={`tel:${site.contact.phone.replace(/\s/g, "")}`}>{site.contact.phone}</a>
              </li>
            )}
          </ul>
        </div>
        <div className="footer__col">
          <h2 className="footer__title label">Légal</h2>
          <ul>
            {LEGAL_NAV.map((item) => (
              <li key={item.to}>
                <TransitionLink to={item.to}>{item.label}</TransitionLink>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="footer__giant" aria-hidden="true">
        <span>MUNAQASA</span>
      </div>

      <div className="footer__bar container">
        <p className="label label--muted">© {year} MUNAQASA</p>
        <p className="label label--muted">{site.signature}</p>
        <button type="button" className="footer__top-btn label" onClick={() => scrollToTop({ smooth: !reduced })}>
          Haut de page <ArrowUp size={14} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
    </footer>
  );
}
