/**
 * États d'un coût ou d'un montant, et règle unique des pertes, partagés par le serveur, les exports et
 * l'interface.
 *
 * Un coût inconnu n'est jamais affiché comme un coût nul :
 * - nul : tous les éléments sont chiffrés et le total vaut réellement zéro ;
 * - non renseigné : aucun élément chiffré ;
 * - partiel : une partie seulement des éléments est chiffrée, le total n'est pas un montant final ;
 * - estimatif : tout est chiffré, mais au moins une consommation reste une hypothèse à confirmer ;
 * - calculé : tout est chiffré à partir de valeurs confirmées.
 *
 * Pertes d'un composant (jamais appliquées deux fois) :
 * - « appliquées » : la consommation saisie est nette, quantité brute = nette × (1 + taux de pertes) ;
 * - « incluses » : la consommation saisie comprend déjà les pertes, quantité brute = consommation saisie,
 *   la quantité nette n'est donnée qu'à titre indicatif (brute ÷ (1 + taux)).
 * Montant d'un composant = quantité brute × coût unitaire.
 */

export const AMOUNT_STATES = ["nul", "non_renseigne", "partiel", "estimatif", "complet"] as const;
export type AmountState = (typeof AMOUNT_STATES)[number];
export const AMOUNT_STATE_LABELS: Record<AmountState, string> = {
  nul: "Coût nul",
  non_renseigne: "Non renseigné",
  partiel: "Partiel",
  estimatif: "Estimatif",
  complet: "Entièrement calculé",
};

/** État d'un ensemble d'éléments chiffrés ou non. */
export function amountState(priced: number, total: number, value: number, hypotheses: number): AmountState {
  if (total === 0 || priced === 0) return "non_renseigne";
  if (priced < total) return "partiel";
  if (value === 0) return "nul";
  return hypotheses > 0 ? "estimatif" : "complet";
}

export const LOSS_MODES = ["appliquee", "incluse"] as const;
export type LossMode = (typeof LOSS_MODES)[number];
export const LOSS_MODE_LABELS: Record<LossMode, string> = {
  appliquee: "Pertes appliquées à la consommation nette",
  incluse: "Pertes déjà comprises dans la consommation",
};

/** Décomposition d'un sous-détail : établie, ou impossible faute de caractéristiques suffisantes. */
export const DECOMPOSITION_STATES = ["decomposee", "impossible"] as const;
export type DecompositionState = (typeof DECOMPOSITION_STATES)[number];
export const DECOMPOSITION_IMPOSSIBLE_LABEL = "Décomposition impossible — caractéristiques à confirmer";
