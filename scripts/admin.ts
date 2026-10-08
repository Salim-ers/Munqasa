/**
 * Compte administrateur : provisionnement et récupération, en ligne de commande uniquement.
 *
 *   npm run admin -- status            état du compte (existence, double authentification, sessions, passkeys)
 *   npm run admin -- create            crée le compte ADMIN_EMAIL (mot de passe saisi masqué)
 *   npm run admin -- reset-password    nouveau mot de passe, toutes les sessions fermées
 *   npm run admin -- reset-2fa         désactive la double authentification (à réactiver à la connexion)
 *   npm run admin -- revoke-sessions   ferme toutes les sessions ouvertes
 *
 * La base visée est celle de DATABASE_URL (Neon) ou, sans elle, la base locale de développement.
 * Le mot de passe n'est jamais écrit dans le code ni dans un fichier : saisie masquée, ou --password-stdin.
 */
import { existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { eq } from "drizzle-orm";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const { getAuth } = await import("../server/auth/auth.js");
const { getDb, schema } = await import("../server/db/index.js");
const { getEnv } = await import("../server/env.js");
const { writeAudit } = await import("../server/services/audit.js");

const MIN_LENGTH = 12;

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

/** Saisie masquée dans le terminal. */
function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const output = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    let muted = false;
    output._writeToOutput = (s: string) => {
      if (!muted || s.includes(question)) output.output.write(s);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
    muted = true;
  });
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
}

async function askPassword(): Promise<string> {
  if (process.argv.includes("--password-stdin")) return readStdin();
  if (!process.stdin.isTTY) fail("Terminal non interactif : utilisez --password-stdin.");
  const first = await askHidden("Mot de passe (12 caractères au moins) : ");
  const second = await askHidden("Confirmation : ");
  if (first !== second) fail("Les deux saisies diffèrent.");
  return first;
}

function checkPassword(password: string) {
  if (password.length < MIN_LENGTH) fail(`Mot de passe trop court (${MIN_LENGTH} caractères au moins).`);
  if (password.length > 256) fail("Mot de passe trop long.");
}

const command = process.argv[2];
const env = getEnv();
if (!env.ADMIN_EMAIL) fail("ADMIN_EMAIL n'est pas défini (variable d'environnement serveur).");
const email = env.ADMIN_EMAIL;
const auth = await getAuth();
const ctx = await auth.$context;
const db = await getDb();
const existing = await ctx.internalAdapter.findUserByEmail(email, { includeAccounts: true });
const target = env.DATABASE_URL ? "Neon (DATABASE_URL)" : "base locale de développement";

switch (command) {
  case "status": {
    if (!existing) {
      console.log(`Aucun compte pour ${email} dans la ${target}. Créez-le : npm run admin -- create`);
      break;
    }
    const sessions = await ctx.internalAdapter.listSessions(existing.user.id);
    const passkeys = await db.select().from(schema.passkey).where(eq(schema.passkey.userId, existing.user.id));
    console.log(`Compte ${email} (${target})`);
    const twoFactorEnabled = (existing.user as { twoFactorEnabled?: boolean | null }).twoFactorEnabled;
    console.log(`  double authentification : ${twoFactorEnabled ? "activée" : "NON activée (demandée à la prochaine connexion)"}`);
    console.log(`  passkeys : ${passkeys.length}`);
    console.log(`  sessions ouvertes : ${sessions.length}`);
    break;
  }
  case "create": {
    if (existing) fail(`Le compte ${email} existe déjà. Pour changer le mot de passe : npm run admin -- reset-password`);
    const users = await db.select({ id: schema.user.id }).from(schema.user);
    if (users.length > 0) fail("Un autre compte existe déjà dans cette base : un seul administrateur est autorisé.");
    const password = await askPassword();
    checkPassword(password);
    const user = await ctx.internalAdapter.createUser({ email, name: "Administrateur", emailVerified: true }, { method: "admin" });
    if (!user) fail("Création refusée.");
    await ctx.internalAdapter.linkAccount({
      userId: user.id,
      providerId: "credential",
      accountId: user.id,
      password: await ctx.password.hash(password),
    });
    await writeAudit({ action: "compte.cree_en_ligne_de_commande", actorUserId: user.id });
    console.log(`✓ Compte ${email} créé dans la ${target}.`);
    console.log("  À la première connexion, la double authentification vous sera demandée.");
    break;
  }
  case "reset-password": {
    if (!existing) fail(`Aucun compte pour ${email}.`);
    const password = await askPassword();
    checkPassword(password);
    await ctx.internalAdapter.updatePassword(existing.user.id, await ctx.password.hash(password));
    await ctx.internalAdapter.deleteUserSessions(existing.user.id);
    await writeAudit({ action: "compte.mot_de_passe_reinitialise_en_ligne_de_commande", actorUserId: existing.user.id });
    console.log("✓ Mot de passe remplacé, toutes les sessions sont fermées.");
    break;
  }
  case "reset-2fa": {
    if (!existing) fail(`Aucun compte pour ${email}.`);
    await db.delete(schema.twoFactor).where(eq(schema.twoFactor.userId, existing.user.id));
    await db.update(schema.user).set({ twoFactorEnabled: false }).where(eq(schema.user.id, existing.user.id));
    await ctx.internalAdapter.deleteUserSessions(existing.user.id);
    await writeAudit({ action: "compte.2fa_reinitialisee_en_ligne_de_commande", actorUserId: existing.user.id });
    console.log("✓ Double authentification désactivée et sessions fermées. Elle sera de nouveau demandée à la connexion.");
    break;
  }
  case "revoke-sessions": {
    if (!existing) fail(`Aucun compte pour ${email}.`);
    await ctx.internalAdapter.deleteUserSessions(existing.user.id);
    await writeAudit({ action: "sessions.revoquees_en_ligne_de_commande", actorUserId: existing.user.id });
    console.log("✓ Toutes les sessions sont fermées.");
    break;
  }
  default:
    console.log("Commandes : status | create | reset-password | reset-2fa | revoke-sessions");
    process.exit(command ? 1 : 0);
}
process.exit(0);
