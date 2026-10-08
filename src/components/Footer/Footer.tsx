import { ArrowUp } from "lucide-react";
import { CONTACT, CTA_LABEL, LEGAL_NAV, NAV } from "../../data/navigation";
import { site } from "../../data/site";
import { useReducedMotion } from "../../hooks/useMediaQuery";
import { scrollToTop } from "../../lib/scroll";
import { CtaLink } from "../CtaLink/CtaLink";
import { TransitionLink } from "../TransitionLink/TransitionLink";
import "./Footer.css";

export function Footer() {
  const reduced = useReducedMotion();
  const year = new Date().getFullYear();

  return (
    <footer className="footer tone-1 has-grain">
      <img className="footer__arch" src="/logos/talab-symbol-reversed.webp" width={662} height={391} alt="" loading="lazy" />

      <div className="footer__cta container">
        <p className="footer__question display-lg">
          Un appel d’offres <em>à préparer ?</em>
        </p>
        <div className="footer__cta-side">
          <p className="body-text">Parlons de l’échéance, des documents disponibles et de l’accompagnement dont votre entreprise a besoin.</p>
          <CtaLink to={CONTACT.to}>{CTA_LABEL}</CtaLink>
        </div>
      </div>

      <div className="footer__nav container">
        <nav aria-label="Navigation du pied de page">
          <ul>
            {NAV.map((item) => (
              <li key={item.to}>
                <TransitionLink to={item.to}>{item.label}</TransitionLink>
              </li>
            ))}
          </ul>
        </nav>
        <ul className="footer__legal">
          {LEGAL_NAV.map((item) => (
            <li key={item.to}>
              <TransitionLink to={item.to}>{item.label}</TransitionLink>
            </li>
          ))}
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

      <div className="footer__brand" aria-hidden="true">
        <img className="footer__brand-day" src="/logos/talab-day-wordmark.webp" width={1313} height={313} alt="" loading="lazy" />
        <img className="footer__brand-night" src="/logos/talab-wordmark-reversed.webp" width={790} height={248} alt="" loading="lazy" />
      </div>

      <div className="footer__bar container">
        <p className="label">© {year} Talab Solutions, appels d’offres au Maroc</p>
        <button type="button" className="footer__top-btn label" onClick={() => scrollToTop({ smooth: !reduced })}>
          Haut de page <ArrowUp size={14} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
    </footer>
  );
}
