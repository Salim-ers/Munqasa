/**
 * Informations de marque. Les coordonnées restent `null` tant qu'elles ne
 * sont pas fournies : aucun e-mail, téléphone ou adresse n'est inventé, et
 * les composants n'affichent que ce qui est renseigné.
 */
export const site = {
  name: "MUNAQASA",
  signature: "Appels d’offres · Maroc",
  url: (import.meta.env.VITE_SITE_URL || "https://munaqasa.ma").replace(/\/+$/, ""),
  contact: {
    email: null as string | null,
    phone: null as string | null,
  },
} as const;
