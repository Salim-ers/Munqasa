/**
 * Compte administrateur initial, créé au déploiement à partir de ADMIN_PASSWORD (variable Vercel de
 * production), pour qui ne passe pas par la ligne de commande :
 * - aucun compte : il est créé pour ADMIN_EMAIL ;
 * - compte existant mais pas encore activé (double authentification absente) : son mot de passe suit
 *   ADMIN_PASSWORD, ce qui permet de corriger une faute de saisie ;
 * - compte activé : ADMIN_PASSWORD est ignorée. Une fois connecté, il faut la supprimer sur Vercel.
 * Le mot de passe n'est jamais journalisé ; seule son empreinte est enregistrée.
 */
import { getAuth } from "../auth/auth.js";
import { getDb, schema } from "../db/index.js";
import { getEnv } from "../env.js";
import { writeAudit } from "./audit.js";

export const MIN_ADMIN_PASSWORD_LENGTH = 12;

export type BootstrapResult = "variable_absente" | "adresse_absente" | "trop_courte" | "cree" | "mot_de_passe_mis_a_jour" | "deja_a_jour" | "deja_active" | "autre_compte";

export async function bootstrapAdmin(): Promise<BootstrapResult> {
  const env = getEnv();
  const password = env.ADMIN_PASSWORD;
  if (!password) return "variable_absente";
  if (!env.ADMIN_EMAIL) return "adresse_absente";
  if (password.length < MIN_ADMIN_PASSWORD_LENGTH) return "trop_courte";
  const email = env.ADMIN_EMAIL;

  const auth = await getAuth();
  const ctx = await auth.$context;
  const db = await getDb();
  const users = await db.select({ id: schema.user.id, email: schema.user.email, twoFactorEnabled: schema.user.twoFactorEnabled }).from(schema.user);

  if (users.length === 0) {
    const user = await ctx.internalAdapter.createUser({ email, name: "Administrateur", emailVerified: true }, { method: "admin" });
    if (!user) throw new Error("Création du compte refusée.");
    await ctx.internalAdapter.linkAccount({ userId: user.id, providerId: "credential", accountId: user.id, password: await ctx.password.hash(password) });
    await writeAudit({ action: "compte.cree_au_deploiement", actorUserId: user.id });
    return "cree";
  }

  const admin = users.find((u) => u.email.toLowerCase() === email);
  if (!admin || users.length > 1) return "autre_compte";
  if (admin.twoFactorEnabled) return "deja_active";

  // Compte pas encore activé : le mot de passe suit la variable (sessions fermées seulement s'il change).
  const credential = (await ctx.internalAdapter.findAccounts(admin.id)).find((a) => a.providerId === "credential");
  if (credential?.password && (await ctx.password.verify({ hash: credential.password, password }))) return "deja_a_jour";
  const hash = await ctx.password.hash(password);
  if (credential) await ctx.internalAdapter.updatePassword(admin.id, hash);
  else await ctx.internalAdapter.linkAccount({ userId: admin.id, providerId: "credential", accountId: admin.id, password: hash });
  await ctx.internalAdapter.deleteUserSessions(admin.id);
  await writeAudit({ action: "compte.mot_de_passe_initial_au_deploiement", actorUserId: admin.id });
  return "mot_de_passe_mis_a_jour";
}
