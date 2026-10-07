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

/** Contact et « Confier un dossier » ne font qu'un : une seule entrée, un seul formulaire. */
export const CTA: NavItem = { to: "/contact", label: "Confier un dossier" };

export const LEGAL_NAV: readonly NavItem[] = [
  { to: "/mentions-legales", label: "Mentions légales" },
  { to: "/politique-confidentialite", label: "Politique de confidentialité" },
];
