/**
 * Au déploiement (buildCommand de vercel.json), après les migrations : crée le compte administrateur à
 * partir de ADMIN_PASSWORD s'il n'existe pas encore (voir server/services/admin-bootstrap.ts).
 * N'interrompt jamais le build et n'affiche jamais le mot de passe.
 *
 *   npm run admin:bootstrap
 */
import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

if (!process.env.ADMIN_PASSWORD?.trim()) {
  console.log("Compte administrateur : ADMIN_PASSWORD absente, rien à faire.");
  process.exit(0);
}
if (process.env.VERCEL && !process.env.DATABASE_URL) {
  console.log("Compte administrateur : DATABASE_URL absente, création reportée.");
  process.exit(0);
}

try {
  const { bootstrapAdmin } = await import("../server/services/admin-bootstrap.js");
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
} catch (error) {
  // Le site doit pouvoir se déployer même si la création échoue (cause dans les journaux du build).
  console.error("⚠ Compte administrateur : création impossible.", error instanceof Error ? error.message : "");
}
process.exit(0);
