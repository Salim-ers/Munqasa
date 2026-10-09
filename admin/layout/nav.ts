/**
 * Navigation de l'administration. Seuls les modules réellement en service y figurent :
 * un module apparaît ici quand ses écrans et son API fonctionnent (aucun lien décoratif).
 */
import type { LucideIcon } from "lucide-react";
import { Bell, Bot, Building2, CalendarDays, FolderKanban, LayoutDashboard, Server, Settings, ShieldCheck, UserRoundSearch } from "lucide-react";

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
    items: [
      { to: "/administration/dashboard", label: "Tableau de bord", icon: LayoutDashboard, keywords: ["accueil", "pilotage", "indicateurs"] },
      { to: "/administration/agenda", label: "Agenda", icon: CalendarDays, keywords: ["échéances", "remise", "visite", "calendrier", "dates"] },
      { to: "/administration/notifications", label: "Notifications", icon: Bell, keywords: ["rappels", "alertes"] },
    ],
  },
  {
    label: "Affaires",
    items: [
      { to: "/administration/affaires", label: "Mes affaires", icon: FolderKanban, keywords: ["projets", "appels d’offres", "dossiers", "lots", "plans", "documents"] },
      { to: "/administration/clients", label: "Clients", icon: Building2, keywords: ["maîtres d’ouvrage", "contacts"] },
      { to: "/administration/prospects", label: "Prospects", icon: UserRoundSearch, keywords: ["commercial", "contacts", "conversion"] },
    ],
  },
  {
    label: "Talab Intelligence",
    items: [{ to: "/administration/agents", label: "Agents IA", icon: Bot, keywords: ["intelligence artificielle", "plans", "métré", "cctp", "dpgf", "sous-détail", "traitements"] }],
  },
  {
    label: "Administration",
    items: [
      { to: "/administration/parametres", label: "Paramètres", icon: Settings, keywords: ["entreprise", "entité", "tva", "identité", "couleurs", "intelligence artificielle", "openai", "modèles", "alertes"] },
      { to: "/administration/systeme", label: "Système", icon: Server, keywords: ["connexions", "sauvegarde", "export", "journal", "audit"] },
      { to: "/administration/securite", label: "Sécurité", icon: ShieldCheck, keywords: ["sessions", "passkey", "double authentification", "mot de passe"] },
    ],
  },
];

export const ALL_NAV_ITEMS = NAV.flatMap((g) => g.items);

export function findNavItem(pathname: string): NavItem | undefined {
  return ALL_NAV_ITEMS.find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`));
}
