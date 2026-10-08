/**
 * Familles de corps d'état (extensible). Sert aux lots des affaires, puis au CCTP, à la DPGF et à la
 * bibliothèque de prix. Chaque famille regroupe des sous-familles ; on ne mélange pas les lots.
 */
export interface TradeFamily {
  key: string;
  label: string;
  subFamilies: string[];
}

export const TRADE_FAMILIES: TradeFamily[] = [
  {
    key: "preparation_terrassement",
    label: "Préparation et terrassement",
    subFamilies: ["Installation de chantier", "Études préparatoires", "Démolition", "Curage", "Terrassements", "Déblais et remblais", "Soutènements et blindage", "Fondations spéciales"],
  },
  {
    key: "gros_oeuvre",
    label: "Structure et gros œuvre",
    subFamilies: [
      "Fondations superficielles",
      "Fondations profondes",
      "Béton armé",
      "Béton précontraint",
      "Coffrage",
      "Ferraillage",
      "Planchers et dalles",
      "Voiles, poteaux, poutres",
      "Maçonneries",
      "Escaliers",
      "Ouvrages enterrés",
      "Structures métalliques",
      "Charpentes bois",
      "Structures mixtes",
    ],
  },
  {
    key: "enveloppe",
    label: "Enveloppe",
    subFamilies: ["Façades", "Façades ventilées", "Murs-rideaux", "Isolation thermique par l’extérieur", "Étanchéité", "Couverture", "Bardage", "Zinguerie", "Menuiseries extérieures", "Protections solaires"],
  },
  {
    key: "second_oeuvre",
    label: "Second œuvre",
    subFamilies: [
      "Cloisons et doublages",
      "Faux plafonds",
      "Plâtrerie",
      "Isolation intérieure",
      "Chapes",
      "Carrelage et faïence",
      "Pierre naturelle",
      "Sols souples",
      "Résine",
      "Parquet",
      "Peinture et revêtements muraux",
      "Menuiserie intérieure",
      "Serrurerie",
      "Vitrerie",
      "Agencement",
    ],
  },
  {
    key: "lots_techniques",
    label: "Lots techniques",
    subFamilies: [
      "Plomberie et sanitaires",
      "Réseaux EF / ECS / EU / EV / EP",
      "CVC, ventilation, climatisation, chauffage",
      "Désenfumage",
      "Électricité courants forts",
      "Électricité courants faibles",
      "Éclairage",
      "SSI et détection incendie",
      "Réseaux VDI",
      "Contrôle d’accès et vidéosurveillance",
      "GTB / GTC",
      "Photovoltaïque",
      "Groupes électrogènes",
      "Ascenseurs",
    ],
  },
  {
    key: "exterieurs_infrastructures",
    label: "Aménagements extérieurs et infrastructures",
    subFamilies: ["VRD", "Assainissement", "Drainage", "Voiries et chaussées", "Bordures et trottoirs", "Réseaux secs et humides", "Éclairage extérieur", "Signalisation", "Clôtures", "Espaces verts et irrigation"],
  },
  {
    key: "ouvrages_specialises",
    label: "Ouvrages spécialisés",
    subFamilies: [
      "Génie civil",
      "Ponts et ouvrages d’art",
      "Ouvrages hydrauliques",
      "Traitement des eaux",
      "Ouvrages industriels",
      "Ouvrages agricoles",
      "Équipements sportifs",
      "Piscines",
      "Ouvrages maritimes et portuaires",
      "Ouvrages de protection",
    ],
  },
];

export const TRADE_KEYS = TRADE_FAMILIES.map((t) => t.key) as [string, ...string[]];

export function tradeLabel(key: string): string {
  return TRADE_FAMILIES.find((t) => t.key === key)?.label ?? key;
}
