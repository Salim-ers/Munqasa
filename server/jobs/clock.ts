/**
 * Horloge de l'étape en cours : échéance de l'exécution (une fonction Vercel est arrêtée net à sa durée
 * maximale), rang de l'étape dans la tranche et numéro de l'essai. Les appels aux modèles s'y règlent pour
 * finir avant l'échéance, au lieu d'être coupés sans laisser de trace.
 */
import { AsyncLocalStorage } from "node:async_hooks";

export interface StepClock {
  /** Instant (ms) avant lequel l'étape doit avoir rendu la main ; Infinity hors de Vercel. */
  deadline: number;
  /** Première étape de la tranche : elle dispose de toute la durée d'une exécution, elle n'est jamais reportée. */
  firstInSlice: boolean;
  /** Numéro de l'essai de l'étape (1 au premier). */
  attempt: number;
  /** Erreur laissée par l'essai précédent ; null si la fonction avait été arrêtée sans en laisser. */
  previousError: string | null;
}

export const stepClock = new AsyncLocalStorage<StepClock>();

/** Le temps restant ne suffit pas pour l'appel : l'étape est reportée à une nouvelle exécution, sans compter d'essai. */
export class StepYield extends Error {
  constructor() {
    super("Étape reportée à une nouvelle exécution : le temps restant ne suffisait pas.");
  }
}
