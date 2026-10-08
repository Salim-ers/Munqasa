/** Formulaires : erreurs renvoyées par le serveur, rattachées à leurs champs. */
import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { ApiError, errorMessage } from "./api";

/**
 * Reporte les erreurs de validation du serveur sur les champs du formulaire.
 * Renvoie le message général à afficher (ou null si tout est rattaché à un champ).
 */
export function applyServerErrors<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>): string | null {
  if (error instanceof ApiError && Object.keys(error.fields).length > 0) {
    let general: string | null = null;
    for (const [key, message] of Object.entries(error.fields)) {
      if (key === "_") general = message;
      else setError(key as Path<T>, { type: "server", message });
    }
    return general;
  }
  return errorMessage(error);
}

/** Valeur de formulaire : null et undefined deviennent une chaîne vide (champs contrôlés). */
export function text(value: string | null | undefined): string {
  return value ?? "";
}
