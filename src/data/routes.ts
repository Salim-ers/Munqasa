/**
 * Métadonnées des routes — source unique pour l'application (titres, meta)
 * et pour le build (HTML statique par route, sitemap).
 * Module pur : aucune dépendance au DOM ni à Vite.
 */
export interface RouteMeta {
  path: string;
  /** Libellé court affiché pendant la transition de page. */
  label: string;
  title: string;
  description: string;
  priority: number;
  indexable: boolean;
}

export const ROUTES: readonly RouteMeta[] = [
  {
    path: "/",
    label: "Accueil",
    title: "Talab Solutions | Gestion et accompagnement des appels d’offres au Maroc",
    description:
      "Talab Solutions accompagne les entreprises au Maroc dans la veille, l’analyse, la constitution et le suivi de leurs dossiers d’appels d’offres : dossier administratif, offre technique, contrôle avant dépôt.",
    priority: 1,
    indexable: true,
  },
  {
    path: "/services",
    label: "Services",
    title: "Services : veille, dossier administratif, offre technique | Talab Solutions",
    description:
      "Veille d’appels d’offres, analyse du dossier de consultation, dossier administratif, structuration de l’offre technique, coordination, contrôle avant dépôt et suivi des consultations au Maroc.",
    priority: 0.9,
    indexable: true,
  },
  {
    path: "/methode",
    label: "Méthode",
    title: "Méthode : de l’avis à la soumission | Talab Solutions",
    description:
      "Sept étapes pour transformer une consultation en dossier structuré : cadrage, veille, analyse, checklist, constitution, revue, soumission et suivi.",
    priority: 0.8,
    indexable: true,
  },
  {
    path: "/expertise",
    label: "Expertise",
    title: "Expertise : montage de dossiers d’appels d’offres au Maroc | Talab Solutions",
    description:
      "Une organisation documentaire rigoureuse pour répondre aux marchés publics et appels d’offres privés au Maroc : entreprises BTP, bureaux d’études, ingénierie, fournisseurs et PME.",
    priority: 0.8,
    indexable: true,
  },
  {
    path: "/contact",
    label: "Contact",
    title: "Contact : confier un dossier d’appel d’offres | Talab Solutions",
    description:
      "Présentez votre consultation, son échéance et vos besoins : veille, analyse, dossier administratif, offre technique, audit avant dépôt ou cellule appels d’offres externalisée.",
    priority: 0.9,
    indexable: true,
  },
  {
    path: "/mentions-legales",
    label: "Mentions légales",
    title: "Mentions légales | Talab Solutions",
    description: "Mentions légales du site Talab Solutions, gestion et accompagnement des appels d’offres au Maroc.",
    priority: 0.2,
    indexable: true,
  },
  {
    path: "/politique-confidentialite",
    label: "Confidentialité",
    title: "Politique de confidentialité | Talab Solutions",
    description:
      "Données collectées par le formulaire de contact de Talab Solutions, finalités, durée de conservation et droits prévus par la loi 09-08.",
    priority: 0.2,
    indexable: true,
  },
];

export const NOT_FOUND_META = {
  label: "Introuvable",
  title: "Pièce introuvable | Talab Solutions",
  description: "Cette page ne figure pas au dossier.",
} as const;

export function routeMeta(pathname: string): RouteMeta | undefined {
  const clean = pathname.replace(/\/+$/, "") || "/";
  return ROUTES.find((r) => r.path === clean);
}
