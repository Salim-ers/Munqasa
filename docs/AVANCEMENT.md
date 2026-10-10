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

## Étape B : socle fonctionnel (terminée)

| Élément | État | Vérification |
| --- | --- | --- |
| API métier protégée : clients, prospects, affaires, lots, échéances, fichiers, entités émettrices, réglages, notifications, IA, système | fait | tests d'intégration : 401 sans session, 403 sans double authentification, 403 depuis un autre site |
| Références automatiques `TAL-AAAA-NNNN` (compteur atomique en base) | fait | test : 20 références demandées en même temps, toutes distinctes |
| Modifications partielles : seuls les champs envoyés changent | fait | tests (Zod 4 réinjectait les valeurs par défaut des champs absents ; corrigé) |
| Affaires : liste (recherche, filtres, tri, pagination, archives), fiche à onglets (synthèse, lots, échéances, documents, historique), changement de statut, estimation en décimal exact | fait | tests + parcours navigateur |
| Clients (identifiants légaux selon le pays, archivage, affaires rattachées) et prospects (qualification, conversion définitive en client) | fait | tests + parcours navigateur |
| Agenda : dates de remise lues sur les affaires, échéances libres, retards, regroupement par semaine | fait | tests + parcours navigateur |
| Téléversement : URL signée vers le compartiment privé (ou envoi local en développement), type réel vérifié sur la signature binaire, taille contrôlée, empreinte SHA-256, doublons signalés, fichier refusé effacé, téléchargement temporaire, suppression définitive tracée | fait en local, R2 développé | tests + navigateur en local ; l'envoi vers R2 sera vérifié dès le compartiment configuré |
| Notifications : rappels J-7, J-3, J-1 et jour même, comptés en jours calendaires à l'heure du pays de l'affaire, jamais en double (index unique) ; cloche et page | fait | tests + parcours navigateur |
| Tâche planifiée quotidienne (Vercel Cron, 6 h UTC, protégée par `CRON_SECRET`) : rappels, nettoyage des envois abandonnés | fait | tests ; première exécution réelle après ajout du secret |
| Paramètres : entités émettrices (TVA et mentions saisies, jamais supposées), identité documentaire avec aperçu, IA (modèles listés par l'API OpenAI, barème saisi, plafond mensuel, essai), alertes | fait | tests + navigateur ; l'essai OpenAI réel attend la clé côté serveur |
| Système : état des services, essai des connexions, sauvegarde JSON (sans aucune donnée d'authentification), volumétrie, journal filtrable | fait | tests + navigateur |
| Tableau de bord relié aux modules (création d'affaire, liens), seuil d'ancienneté des prix lu dans les réglages | fait | navigateur |
| Interface jour et nuit, téléphone (fenêtres en feuille montante, listes en cartes), tablette ; chargement par page (code initial ramené de 807 à 272 Ko) | fait | captures à 1440, 820 et 390 px, jour et nuit, aucun débordement |
| CSP propre à l'administration (seul le stockage R2 s'ajoute au site) | fait | build de production vérifié sous la CSP réelle : aucune violation |
| Tests de bout en bout versionnés (`npm run test:e2e`, Chrome) | fait | 12 parcours, aucune erreur dans le navigateur |

Tests : `npm test` (55 tests : 13 d'authentification, 38 métier, 4 sur les schémas partagés) et `npm run test:e2e`
(12 parcours complets, base et stockage jetables, aucune clé externe).

Limites connues de cette étape, à traiter plus tard :

- **Antivirus** : les fichiers sont vérifiés (type réel, taille), pas analysés par un antivirus ; cela demande un
  service externe, à décider.
- **Gros fichiers** : l'empreinte SHA-256 n'est calculée qu'en dessous de 100 Mo ; au-delà, un traitement de fond
  s'en chargera (étape C). En production, tout envoi passe par R2 (les fonctions Vercel limitent les requêtes à 4,5 Mo).
- **Bibliothèque de documents sans affaire** : prête côté API et testée ; son écran reste à faire.
- **Notifications par e-mail** : non prévues à ce stade (notifications dans l'application uniquement).

## Étape C : agents IA (en cours)

| Élément | État | Vérification |
| --- | --- | --- |
| Traitements longs : étapes persistées, verrou, tranches de temps et relance automatique sur Vercel, reprise après interruption, annulation, nouvel essai sur incident passager | fait | tests d'intégration (incident, erreur de configuration, budget de temps, annulation, jeton de relance) |
| Appels aux agents : API OpenAI Responses, sorties structurées validées par schéma, modèle choisi dans les paramètres, plafond mensuel, journal des exécutions et consommation | fait | tests avec un fournisseur simulé |
| Agent « Lecture des plans et métré » : PDF découpé page par page, relevé de chaque page (cartouche, éléments de gros œuvre, cotes lisibles avec leur source), métré proposé avec formules ; quantités calculées par le serveur en décimal exact ; fichiers illisibles écartés avec explication | fait | tests d'intégration et parcours navigateur (simulation) ; essai réel dès que R2 est configuré |
| Métré : ouvrages et mesures modifiables, aperçu du calcul en direct, validation, rejet, traçabilité des sources ; une nouvelle analyse ne remplace que les propositions non validées | fait | tests + parcours navigateur |
| Page « Agents IA » : prérequis, lancement, suivi en direct des traitements | fait | parcours navigateur |
| Référentiel : lois, normes, DTU, règlements, avec statut de vérification ; catalogue de départ importable (références courantes du gros œuvre, toutes « à vérifier ») | fait | tests d'intégration + parcours navigateur |
| Agent « Rédaction du CCTP » : plan adapté au lot et au métré, rédaction chapitre par chapitre en blocs structurés, citations limitées aux références choisies, valeurs non justifiées signalées comme à préciser ; réécriture ciblée d'articles avec consigne | fait | tests (simulation) + parcours navigateur |
| Contrôle qualité du CCTP : articles non rédigés, références à vérifier ou rejetées, normes écrites hors référentiel, ouvrages du métré non couverts ; points mis de côté avec motif ; validation refusée tant qu'une anomalie bloquante est ouverte | fait | tests d'intégration |
| CCTP : lecture et édition article par article, validation, versions figées, export Word (couverture à l'identité documentaire, sommaire, annexe des références citées) | fait | tests + parcours navigateur |
| Agent « DPGF depuis le CCTP » : postes établis chapitre par chapitre, chacun relié à son article du CCTP et à son ouvrage ; quantité reprise du métré (avec sa source), forfait ou « à métrer » ; aucun prix inventé | fait | tests (simulation) + parcours navigateur |
| DPGF modifiable dans les cellules, numérotation automatique, montants et taxe en décimal exact, sous-totaux ; contrôle qualité (quantités, liens, unités, doublons, chiffrage) ; validation, versions, export Excel avec formules vivantes | fait | tests d'intégration + parcours navigateur |
| Bibliothèque de prix : chaque prix avec sa provenance, sa date, sa zone et son statut de vérification ; historique de chaque valeur ; import CSV ou Excel avec correspondance des colonnes et lignes refusées avec leur motif ; fournisseurs ; archivage | fait | tests d'intégration + parcours navigateur |
| Agent « Sous-détails de prix » : décomposition de chaque poste de la DPGF ; coûts tirés uniquement des prix candidats de la bibliothèque (même devise, même pays, recherche plein texte en français), jamais du modèle ; consommations marquées comme hypothèses ; calcul exact par le serveur (déboursé sec, frais de chantier, frais généraux et aléas sur leur assiette, y compris le prix de revient, marge, marque ou coefficient) ; un sous-détail validé n'est jamais remplacé | fait | tests (simulation) + parcours navigateur |
| Sous-détails : édition des composants et des taux, validation qui fige, report des prix validés dans la DPGF, contrôle qualité (prix manquants, à vérifier, anciens ou archivés, hypothèses, écarts avec la DPGF), export Excel ; frais et marge par défaut dans *Paramètres* > *Chiffrage* | fait | tests d'intégration + parcours navigateur |
| Devis | à venir | |

Prérequis de l'agent de lecture des plans en production : le compartiment R2 (les plans doivent pouvoir être déposés).
Prérequis de l'agent des sous-détails : une bibliothèque de prix renseignée ; sans prix, il ne peut rien chiffrer.

## Étapes C à E

Voir `docs/ARCHITECTURE.md`, section « Phases ».

## Interventions nécessaires de votre part

1. **Base Neon** : sur Vercel, *Storage* > *Create Database* > *Neon*, reliée au projet (ajoute `DATABASE_URL`).
2. **Variables Vercel** (*Settings* > *Environment Variables*) : `BETTER_AUTH_SECRET` (32 caractères au moins),
   `ADMIN_EMAIL` (votre adresse), et `APP_URL` si le site a un domaine personnalisé.
3. **Créer votre compte**, une fois la base en place, au choix :
   - sur Vercel, définir `ADMIN_PASSWORD` (12 caractères au moins) puis redéployer : le compte est créé au
     déploiement ; une fois connecté, supprimer la variable ;
   - ou en local, avec la `DATABASE_URL` de production dans la session du terminal, lancer
     `npm run admin -- create` et saisir le mot de passe (masqué).
4. **Première connexion** : activer la double authentification et conserver les codes de secours.
5. **Clé OpenAI** : la régénérer par précaution (elle a été collée un jour dans un fichier suivi par Git, jamais
   publiée), puis la déclarer dans les variables Vercel (`OPENAI_API_KEY`). Choisir ensuite les modèles et saisir
   leur barème dans *Paramètres* > *Intelligence artificielle*.
6. **Stockage des fichiers** : sur Cloudflare, créer un compartiment R2 **privé** et un jeton d'API limité à ce
   compartiment (lecture et écriture d'objets). Variables Vercel : `S3_ENDPOINT`
   (`https://<identifiant du compte>.r2.cloudflarestorage.com`), `S3_REGION` (`auto`), `S3_BUCKET`,
   `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`. Dans les réglages du compartiment, règle CORS :

   ```json
   [{ "AllowedOrigins": ["https://munqasa.vercel.app"], "AllowedMethods": ["PUT"], "AllowedHeaders": ["content-type"], "MaxAgeSeconds": 3600 }]
   ```

   (ajouter le domaine définitif dans `AllowedOrigins` le moment venu). Sans ces variables, l'envoi de fichiers
   répond « stockage non configuré » en production.
7. **Tâche planifiée** : générer un secret long (`openssl rand -hex 32`) et le déclarer dans Vercel sous
   `CRON_SECRET`. Vercel l'envoie automatiquement à chaque exécution quotidienne ; la page *Système* indique
   s'il est présent.
8. **Prix et chiffrage** : importer vos prix (bordereaux, devis fournisseurs, anciennes DPGF) dans
   *Bibliothèque de prix*, les vérifier, puis saisir frais généraux, aléas et marge dans *Paramètres* > *Chiffrage*.
9. **Clé de session** : `BETTER_AUTH_SECRET` doit être longue et aléatoire (64 caractères hexadécimaux). Elle chiffre
   aussi la double authentification : après son remplacement et le redéploiement, celle-ci est réinitialisée
   automatiquement au déploiement ; se reconnecter avec le mot de passe et la réactiver (nouveau code QR,
   nouveaux codes de secours).
