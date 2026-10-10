/**
 * Au déploiement (buildCommand de vercel.json), après les migrations :
 * - crée le compte administrateur à partir de ADMIN_PASSWORD s'il n'existe pas encore ;
 * - réinitialise la double authentification si elle est devenue illisible (BETTER_AUTH_SECRET remplacée).
 * Voir server/services/admin-bootstrap.ts. N'interrompt jamais le build et n'affiche jamais le mot de passe.
 *
 *   npm run admin:bootstrap
 */
import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

// Une prévisualisation ne touche jamais au compte de production (ni création, ni réinitialisation).
if (process.env.VERCEL_ENV === "preview") {
  console.log("Prévisualisation : compte administrateur non vérifié.");
  process.exit(0);
}
if (process.env.VERCEL && !process.env.DATABASE_URL) {
  console.log("Compte administrateur : DATABASE_URL absente, rien à vérifier.");
  process.exit(0);
}

try {
  const { bootstrapAdmin, checkSecondFactor } = await import("../server/services/admin-bootstrap.js");
  const result = await bootstrapAdmin();
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const messages: Record<typeof result, string> = {
    variable_absente: "Compte administrateur : ADMIN_PASSWORD absente, rien à faire.",
    adresse_absente: "⚠ Compte administrateur non créé : ADMIN_EMAIL absente.",
    trop_courte: "⚠ Compte administrateur non créé : ADMIN_PASSWORD doit compter au moins 12 caractères.",
    cree: `✓ Compte administrateur créé pour ${email}. Connectez-vous, activez la double authentification, puis supprimez ADMIN_PASSWORD sur Vercel.`,
    mot_de_passe_mis_a_jour: `✓ Mot de passe du compte ${email} (pas encore activé) aligné sur ADMIN_PASSWORD.`,
    deja_a_jour: `Compte administrateur ${email} en attente d'activation : mot de passe déjà à jour.`,
    deja_active: "Compte administrateur déjà activé : ADMIN_PASSWORD est ignorée. Supprimez-la sur Vercel.",
    autre_compte: "⚠ Un compte différent de ADMIN_EMAIL existe déjà : rien n'a été modifié.",
  };
  console.log(messages[result]);
  if ((await checkSecondFactor()) === "reinitialisee") {
    console.log("✓ Double authentification réinitialisée : la clé de session a changé. Connectez-vous avec votre mot de passe, elle vous sera redemandée.");
  }
} catch (error) {
  // Le site doit pouvoir se déployer même si la vérification échoue (cause dans les journaux du build).
  console.error("⚠ Compte administrateur : vérification impossible.", error instanceof Error ? error.message : "");
}
process.exit(0);
