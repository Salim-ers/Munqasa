/**
 * Règles de lot pour la lecture des plans et le métré : éléments à relever et unités usuelles de chaque
 * famille de corps d'état. Ce sont des conventions d'unités de la pratique courante, pas des règles
 * normatives : aucun seuil de déduction n'est supposé, chaque vide mesuré est déduit explicitement, sauf
 * règle contraire donnée par le CCTP ou la consigne de l'administrateur.
 */
export interface LotRule {
  label: string;
  elements: string;
  units: string;
}

export const LOT_RULES: Record<string, LotRule> = {
  preparation_terrassement: {
    label: "préparation et terrassement",
    elements: "décapage, terrassements généraux, fouilles en rigole et en puits, remblais, purges, évacuation des terres",
    units: "volumes en m3 (en place, sans foisonnement sauf indication du plan), surfaces de décapage en m2",
  },
  gros_oeuvre: {
    label: "structure et gros œuvre",
    elements: "terrassements, fondations, longrines, dallages, voiles, murs, poteaux, poutres, dalles, escaliers, acrotères, maçonneries, ouvertures dans les éléments porteurs, réseaux enterrés",
    units: "béton en m3, coffrages en m2, armatures en kg seulement si une nomenclature les donne, maçonneries en m2, éléments répétés en u",
  },
  enveloppe: {
    label: "enveloppe",
    elements: "façades, isolation thermique par l’extérieur, bardages, étanchéité, relevés, couverture, zinguerie, menuiseries extérieures, protections solaires",
    units: "surfaces en m2, relevés, acrotères et habillages en ml, menuiseries en u avec leurs dimensions",
  },
  second_oeuvre: {
    label: "second œuvre",
    elements: "cloisons, doublages, faux plafonds, chapes, revêtements de sol et muraux, faïences, peintures, menuiseries intérieures, serrurerie, vitrerie",
    units: "surfaces en m2 par local quand le plan donne les surfaces, plinthes et habillages en ml, portes et équipements en u",
  },
  lots_techniques: {
    label: "lots techniques",
    elements: "appareils sanitaires, réseaux de plomberie, de ventilation et d’électricité, points lumineux, prises, tableaux, équipements de chauffage, de ventilation et de climatisation",
    units: "appareils et équipements en u, réseaux en ml",
  },
  exterieurs_infrastructures: {
    label: "aménagements extérieurs et infrastructures",
    elements: "voiries, parkings, trottoirs, bordures, caniveaux, réseaux enterrés, regards, clôtures, espaces verts",
    units: "chaussées et surfaces en m2, bordures, réseaux et clôtures en ml, regards et ouvrages ponctuels en u",
  },
  ouvrages_specialises: {
    label: "ouvrages spécialisés",
    elements: "éléments propres à l’ouvrage décrit par le plan",
    units: "unités indiquées par le plan ou usuelles pour l’ouvrage",
  },
};

/** Paragraphe de consigne propre au lot (gros œuvre par défaut). */
export function lotRuleText(tradeFamily: string | null | undefined): string {
  const rule = LOT_RULES[tradeFamily ?? ""] ?? LOT_RULES.gros_oeuvre!;
  return `Lot concerné : ${rule.label}. Éléments à relever en priorité : ${rule.elements}. Unités usuelles : ${rule.units}. Aucun seuil de déduction n’est supposé : chaque vide mesuré est déduit explicitement, sauf règle contraire donnée par la consigne.`;
}
