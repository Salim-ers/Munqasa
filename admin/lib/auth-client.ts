/** Client Better Auth : connexion, double authentification, passkeys, sessions. Même origine que le site. */
import { passkeyClient } from "@better-auth/passkey/client";
import { twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [twoFactorClient(), passkeyClient()],
});

/** Message lisible pour une erreur d'authentification. */
export function authErrorMessage(error: { status?: number; code?: string; message?: string } | null | undefined): string {
  if (!error) return "Une erreur est survenue.";
  if (error.status === 429) return "Trop de tentatives. Patientez quelques minutes avant de réessayer.";
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "Adresse ou mot de passe incorrect.";
    case "INVALID_CODE":
    case "INVALID_BACKUP_CODE":
    case "OTP_HAS_EXPIRED":
      return "Code incorrect ou expiré.";
    case "INVALID_TWO_FACTOR_COOKIE":
      return "La vérification a expiré. Reprenez la connexion depuis le début.";
    case "ACCOUNT_TEMPORARILY_LOCKED":
    case "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE":
    case "TOO_MANY_REQUESTS":
      return "Trop d'essais : le compte est temporairement verrouillé. Réessayez plus tard.";
    default:
      return error.status === 401 ? "Identifiants refusés." : "La demande n'a pas abouti. Réessayez.";
  }
}
