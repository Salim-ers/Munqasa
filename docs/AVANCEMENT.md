# Avancement de Talab Intelligence

État réel, mis à jour à la fin de chaque étape. « Fait » signifie développé **et** testé ; une page qui existe
sans fonctionner n'est jamais comptée comme faite.

## Étape A : audit, infrastructure, authentification (terminée)

| Élément | État | Vérification |
| --- | --- | --- |
| Audit du dépôt, architecture cible | fait | `docs/ARCHITECTURE.md` |
| Schéma PostgreSQL complet (44 tables, 36 énumérations, 62 clés étrangères) | fait | migration `server/db/migrations/0000_initial.sql` appliquée sur PostgreSQL (PGlite) |
| Connexion Neon (production) / PGlite (développement, tests) | fait | même schéma, mêmes migrations |
| Migrations : `npm run db:migrate`, et au déploiement Vercel | fait | ignorées tant que `DATABASE_URL` est absente |
| Authentification Better Auth, compte unique, inscription désactivée | fait | tests d'intégration |
| Création du compte en ligne de commande (`npm run admin -- create`), récupération | fait | testé (création, état) |
| Double authentification TOTP obligatoire, codes de secours à usage unique, verrouillage | fait | tests + parcours navigateur |
| Passkeys (WebAuthn) : connexion, ajout, suppression | développé | nécessite un appareil réel pour l'essai complet |
| Sessions : liste (appareil, adresse IP), fermeture unitaire ou globale, expiration 12 h | fait | parcours navigateur |
| Limitation des tentatives (en base, compatible serverless) | fait | test : réponse 429 |
| Contrôle d'origine sur toutes les requêtes modifiantes (dont la connexion) | fait | test : origine étrangère refusée |
| Journal d'audit des connexions et actions de sécurité | fait | tests + page Sécurité |
| Protection serveur de chaque route `/api/admin/*` | fait | test : 401 sans session, 403 sans double authentification |
| Lien « Administration » discret dans le pied de page | fait | jour, nuit, mobile |
| Interface : connexion, activation 2FA, tableau de bord V2, Sécurité, palette Ctrl/⌘ K | fait | parcours navigateur, jour / nuit, tablette, mobile |
| `noindex` sur l'administration et l'API, `robots.txt` | fait | |

Tests : `npm test` (13 tests d'authentification et de protection, base PostgreSQL réelle en mémoire).

## Étape B : socle fonctionnel (à venir)

Affaires (création, référence automatique, lots, échéances, onglets), clients, prospects, agenda, notifications,
téléversement sécurisé (stockage privé, URL signées, vérification du type réel), paramètres de l'entreprise,
identité documentaire, paramètres IA (modèles disponibles via l'API), journal général.

## Étapes C à E

Voir `docs/ARCHITECTURE.md`, section « Phases ».

## Interventions nécessaires de votre part

1. **Base Neon** : sur Vercel, *Storage* > *Create Database* > *Neon*, reliée au projet (ajoute `DATABASE_URL`).
2. **Variables Vercel** (*Settings* > *Environment Variables*) : `BETTER_AUTH_SECRET` (32 caractères au moins),
   `ADMIN_EMAIL` (votre adresse), et `APP_URL` si le site a un domaine personnalisé.
3. **Créer votre compte**, une fois la base en place : en local, avec la `DATABASE_URL` de production dans
   `.env.local` (ou `vercel env pull`), lancer `npm run admin -- create` et saisir le mot de passe (masqué).
4. **Première connexion** : activer la double authentification et conserver les codes de secours.
5. **Clé OpenAI** : la régénérer par précaution (elle a été collée un jour dans un fichier suivi par Git, jamais
   publiée), puis la déclarer dans les variables Vercel (`OPENAI_API_KEY`).
6. **Stockage des fichiers** (étape B) : un compartiment Cloudflare R2 privé et ses clés (`S3_*`).
