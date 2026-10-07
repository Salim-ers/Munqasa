import { useLocation } from "react-router";
import { NAV } from "../../data/navigation";
import { useHeaderState } from "../../hooks/useHeaderState";
import { CtaLink } from "../CtaLink/CtaLink";
import { Logo } from "../Logo/Logo";
import { TransitionLink } from "../TransitionLink/TransitionLink";
import "./Header.css";

interface HeaderProps {
  menuOpen: boolean;
  onToggleMenu: () => void;
}

export function Header({ menuOpen, onToggleMenu }: HeaderProps) {
  const { pathname } = useLocation();
  const { surface, compact } = useHeaderState(pathname);
  const tone = menuOpen ? "dark" : surface;

  return (
    <header className={["header", `header--${tone}`, compact && !menuOpen ? "is-compact" : ""].filter(Boolean).join(" ")}>
      <div className="header__inner">
        <TransitionLink to="/" className="header__brand" aria-label="MUNAQASA — accueil">
          <Logo tone={tone} />
        </TransitionLink>

        <nav className="header__nav" aria-label="Navigation principale">
          <ul>
            {NAV.map((item) => {
              const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
              return (
                <li key={item.to}>
                  <TransitionLink to={item.to} className="header__link" aria-current={active ? "page" : undefined}>
                    {item.label}
                  </TransitionLink>
                </li>
              );
            })}
          </ul>
        </nav>

        <CtaLink to="/contact" className="header__cta">
          Confier un dossier
        </CtaLink>

        <button
          type="button"
          className="header__toggle"
          aria-expanded={menuOpen}
          aria-controls="menu-mobile"
          onClick={onToggleMenu}
        >
          <span className="label">{menuOpen ? "Fermer" : "Menu"}</span>
          <span className="header__toggle-lines" aria-hidden="true">
            <i />
            <i />
          </span>
        </button>
      </div>
    </header>
  );
}
