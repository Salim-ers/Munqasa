/**
 * Politique de double authentification, fixée par la configuration du serveur (variable TALAB_2FA) :
 * - « obligatoire » : second facteur TOTP exigé (module Better Auth chargé, garde serveur qui le réclame) ;
 * - toute autre valeur, ou variable absente : désactivée temporairement, connexion par adresse et mot de passe.
 * La désactivation ne supprime rien : secrets TOTP, codes de secours et passkeys restent en base et
 * redeviennent actifs dès le retour de TALAB_2FA=obligatoire, sans migration. Les autres protections ne
 * changent pas : mot de passe haché, limitation des tentatives, sessions, contrôle d'origine, compte unique,
 * journal des connexions.
 */
import { getEnv } from "../env.js";

export type SecondFactorPolicy = "obligatoire" | "desactivee";

export function secondFactorPolicy(): SecondFactorPolicy {
  return getEnv().TALAB_2FA === "obligatoire" ? "obligatoire" : "desactivee";
}

export function secondFactorRequired(): boolean {
  return secondFactorPolicy() === "obligatoire";
}
