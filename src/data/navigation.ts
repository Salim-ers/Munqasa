export interface NavItem {
  to: string;
  label: string;
}

export const NAV: readonly NavItem[] = [
  { to: "/", label: "Accueil" },
  { to: "/services", label: "Services" },
  { to: "/methode", label: "Méthode" },
  { to: "/expertise", label: "Expertise" },
  { to: "/contact", label: "Contact" },
];

export const LEGAL_NAV: readonly NavItem[] = [
  { to: "/mentions-legales", label: "Mentions légales" },
  { to: "/politique-confidentialite", label: "Politique de confidentialité" },
];
