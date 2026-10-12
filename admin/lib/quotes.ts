/** Devis : tons des statuts, actions proposées selon le statut, message d'erreur précis. */
import type { QuoteStatus } from "../../shared/enums";
import { ApiError, errorMessage } from "./api";

export const quoteStatusTone: Record<QuoteStatus, "neutral" | "accent" | "success" | "warning" | "danger" | "dark"> = {
  brouillon: "neutral",
  a_verifier: "warning",
  valide: "accent",
  envoye: "dark",
  accepte: "success",
  refuse: "danger",
  expire: "neutral",
};

export type QuoteActionKey = "soumettre" | "valider" | "rouvrir" | "envoyer" | "relancer" | "accepter" | "refuser" | "nouvelle-version";

/** Actions de statut proposées pour un devis, la principale en premier. */
export function quoteActions(status: QuoteStatus): Array<{ key: QuoteActionKey; label: string }> {
  switch (status) {
    case "brouillon":
      return [
        { key: "soumettre", label: "Soumettre à vérification" },
        { key: "valider", label: "Déclarer prêt à envoyer" },
      ];
    case "a_verifier":
      return [
        { key: "valider", label: "Déclarer prêt à envoyer" },
        { key: "rouvrir", label: "Rouvrir en brouillon" },
      ];
    case "valide":
      return [
        { key: "envoyer", label: "Marquer comme envoyé" },
        { key: "rouvrir", label: "Rouvrir en brouillon" },
      ];
    case "envoye":
      return [
        { key: "accepter", label: "Marquer accepté" },
        { key: "refuser", label: "Marquer refusé" },
        { key: "relancer", label: "Noter une relance" },
        { key: "nouvelle-version", label: "Préparer une nouvelle version" },
      ];
    default:
      return [{ key: "nouvelle-version", label: "Préparer une nouvelle version" }];
  }
}

/** Message d'une erreur de l'API des devis : le motif précis plutôt que le message générique de validation. */
export function quoteError(error: unknown): string {
  if (error instanceof ApiError && Object.keys(error.fields).length) return Object.values(error.fields)[0]!;
  return errorMessage(error);
}

/** Taux lisible : « 20 % », « 5,5 % ». */
export const rateLabel = (rate: string | number | null | undefined) => (rate === null || rate === undefined || rate === "" ? "" : `${Number(rate).toLocaleString("fr-FR", { maximumFractionDigits: 3 })} %`);

/** Unité affichée : m2 et m3 en exposant. */
export const unitLabel = (unit: string | null | undefined) => (unit ?? "").replace(/^m2$/i, "m²").replace(/^m3$/i, "m³");
