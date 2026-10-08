/**
 * Navigation de l'administration. Seuls les modules réellement en service y figurent :
 * un module apparaît ici quand ses écrans et son API fonctionnent (aucun lien décoratif).
 */
import type { LucideIcon } from "lucide-react";
import { LayoutDashboard, ShieldCheck } from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Mots-clés de la palette de commandes. */
  keywords?: string[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: "Vue générale",
    items: [{ to: "/administration/dashboard", label: "Tableau de bord", icon: LayoutDashboard, keywords: ["accueil", "pilotage", "indicateurs"] }],
  },
  {
    label: "Administration",
    items: [{ to: "/administration/securite", label: "Sécurité", icon: ShieldCheck, keywords: ["sessions", "passkey", "double authentification", "mot de passe", "journal"] }],
  },
];

export const ALL_NAV_ITEMS = NAV.flatMap((g) => g.items);

export function findNavItem(pathname: string): NavItem | undefined {
  return ALL_NAV_ITEMS.find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`));
}
