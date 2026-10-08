export interface NavItem {
  to: string;
  label: string;
}

export const NAV: readonly NavItem[] = [
  { to: "/", label: "Accueil" },
  { to: "/services", label: "Services" },
  { to: "/methode", label: "Méthode" },
  { to: "/expertise", label: "Expertise" },
];

/** Bouton de la barre de navigation. */
export const CONTACT: NavItem = { to: "/contact", label: "Contact" };

/** Appel à l'action (accueil, pied de page) : même destination, formulé comme une action. */
export const CTA_LABEL = "Confier un dossier";

export const LEGAL_NAV: readonly NavItem[] = [
  { to: "/mentions-legales", label: "Mentions légales" },
  { to: "/politique-confidentialite", label: "Politique de confidentialité" },
];
