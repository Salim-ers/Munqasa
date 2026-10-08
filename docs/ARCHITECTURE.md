# Talab Solutions Intelligence : architecture

Ce document décrit l'architecture de l'espace d'administration (« Talab Intelligence ») ajouté au site vitrine
Talab Solutions. Il fixe les choix techniques, le modèle de données, la sécurité et le découpage en phases.
Il est tenu à jour à chaque étape.

## 1. Audit du dépôt existant

| Élément | Constat |
| --- | --- |
| Framework | Vite 8 + React 19 + React Router 8 (application monopage), TypeScript strict |
| Rendu SEO | plugin Vite maison (`build/seo-plugin.ts`) : un HTML statique par route, sitemap, robots |
| Serveur | une fonction Vercel (`api/contact.ts`), signature web standard (`POST(request: Request)`) |
| Design | jetons CSS maison (`src/styles/tokens.css`), sans Tailwind ; Instrument Serif + Manrope auto-hébergées |
| Jour / nuit | `html[data-theme]`, appliqué avant rendu par `public/theme-init.js` ; terracotta le jour, or la nuit |
| Animations | GSAP + ScrollTrigger + Lenis (vitrine uniquement) |
| Hébergement | Vercel, en-têtes de sécurité stricts (`vercel.json` : CSP `script-src 'self'`, HSTS, etc.) |
| Données | aucune base de données, aucune authentification |

**Conséquences.** La vitrine est une application Vite avec un rendu SEO de build. La migrer vers Next.js
reviendrait à la réécrire (routes, SEO, animations) et à risquer de la casser, ce que le cahier des charges interdit.
L'espace d'administration est donc ajouté **à côté** de la vitrine, dans le même dépôt et le même projet Vercel,
sans la modifier (hormis le lien « Administration » du pied de page).

## 2. Architecture cible

```
navigateur
 ├─ /                      vitrine (index.html → src/)            inchangée
 └─ /administration/*      application d'administration           entrée Vite séparée (administration/index.html → admin/)
                              │  fetch same-origin, cookies de session HttpOnly
                              ▼
Vercel Functions (Node 24)
 ├─ /api/contact           formulaire de la vitrine               inchangé
 └─ /api/*                 API Hono (server/)                      une fonction : api/[...path].ts
       ├─ /api/auth/*        Better Auth (connexion, 2FA, passkeys, sessions)
       ├─ /api/admin/*       API métier, protégée administrateur sur chaque route
       └─ /api/jobs/*        traitements longs (appel planifié + relance immédiate)
              │
              ├─ Neon PostgreSQL       données structurées, relations, versions, journal (Drizzle ORM)
              ├─ Stockage objet S3     fichiers privés : plans, sources, exports (Cloudflare R2 en production)
              └─ API OpenAI            agents (Responses API, Structured Outputs, outils à permissions)
```

### Choix techniques

| Besoin | Choix | Raison |
| --- | --- | --- |
| Interface d'administration | React 19 + React Router (même stack que la vitrine), entrée Vite séparée | aucune réécriture ; bundle, CSS et routeur isolés de la vitrine |
| Styles admin | Tailwind CSS 4, limité aux fichiers de `admin/` | la vitrine garde ses styles ; aucun style admin ne la touche |
| Composants | primitives Radix (accessibilité), composants maison au style shadcn | dialogues, menus, onglets accessibles au clavier |
| Animations admin | Motion (ex-Framer Motion) | transitions de pages, indicateur actif, compteurs |
| Tableaux | TanStack Table 8 | tri, filtres, pagination, virtualisation des grands DPGF |
| Formulaires | React Hook Form + Zod (schémas partagés client / serveur dans `shared/`) | une seule validation, appliquée des deux côtés |
| Graphiques | Recharts | courbes fines, interactives |
| API | Hono (API web standard) | typée, légère ; tourne telle quelle sur Vercel et en local dans Vite |
| Base de données | **Neon PostgreSQL** + Drizzle ORM | Neon imposé ; Drizzle : SQL explicite, migrations versionnées, types |
| Connexion Neon | `@neondatabase/serverless` (WebSocket, transactions) | adapté au serverless, transactions pour les opérations financières |
| Base locale (dev, tests) | PGlite : PostgreSQL embarqué, mêmes migrations | développer et tester sans compte Neon ; **jamais en production** |
| Authentification | **Better Auth** (auto-hébergé dans Neon) | email + mot de passe sans inscription, TOTP, codes de secours, passkeys, sessions, limitation des tentatives |
| Calculs | decimal.js + colonnes `numeric` | aucun arrondi flottant JavaScript sur les montants et quantités |
| IA | API OpenAI officielle, côté serveur uniquement | Responses API, Structured Outputs (Zod), outils à permissions explicites |
| Fichiers | stockage compatible S3 (Cloudflare R2), compartiment privé, URL signées | les fichiers lourds ne transitent pas par les fonctions (limite 4,5 Mo) |
| Traitements longs | file de traitements en base (étapes persistées, reprenables, idempotentes) | une génération de 40 pages ne dépend pas d'une requête HTTP |
| Documents | données structurées → gabarits : PDF (pdfmake), DOCX (docx), XLSX avec formules (ExcelJS), ZIP | présentation séparée des données métier |
| Tests | Vitest (unitaires, intégration sur PGlite), Playwright (bout en bout) | |

Pourquoi pas Next.js : la vitrine n'est pas une application Next.js ; le cahier des charges demande de respecter
la stack existante. Pourquoi pas Neon Auth : Better Auth s'installe dans la même base Neon, sans service tiers,
et couvre exactement le besoin (un seul compte, 2FA, passkeys). Pourquoi pas Vercel Workflows d'emblée : la file
en base fonctionne en local comme en production et n'impose aucun service supplémentaire ; elle pourra être
remplacée sans toucher au métier.

## 3. Arborescence

```
administration/index.html     entrée HTML de l'administration (noindex)
admin/                        application d'administration (React)
  main.tsx, router.tsx
  layout/                     barre latérale, barre supérieure, fil d'Ariane, palette de commandes
  pages/                      connexion, tableau de bord, affaires, clients, bibliothèques, paramètres…
  components/                 composants d'interface (boutons, cartes, tableaux, dialogues…)
  lib/                        client API, client d'authentification, formatage
  styles/                     Tailwind et jetons de l'administration (jour / nuit)
api/[...path].ts              fonction Vercel : délègue à l'API Hono
server/
  env.ts                      variables d'environnement validées (échec immédiat si absente en production)
  db/                         connexion (Neon ou PGlite), schéma Drizzle, migrations
  auth/                       Better Auth, garde administrateur
  http/                       application Hono, routes
  services/                   calculs, devises, stockage, OpenAI, documents, traitements longs
  agents/                     agents spécialisés et orchestrateur (phase C)
shared/                       schémas Zod et types communs à l'interface et au serveur
scripts/admin.ts              provisionnement et récupération du compte administrateur (ligne de commande)
tests/                        tests Vitest et Playwright
docs/                         architecture, exploitation, sécurité
```

## 4. Modèle de données (Neon PostgreSQL)

Tous les montants et quantités sont en `numeric` (précision fixe) et calculés avec decimal.js.
Chaque document métier (CCTP, DPGF, sous-détail, devis) a des versions figées (`document_version`) :
une régénération crée une nouvelle version et ne remplace jamais une version validée.

| Domaine | Tables |
| --- | --- |
| Authentification (Better Auth) | `user`, `session`, `account`, `verification`, `two_factor`, `passkey`, `rate_limit` |
| Entreprise | `company_profile`, `app_setting` |
| Relation client | `client`, `prospect` |
| Affaires | `project`, `project_lot`, `deadline`, `reference_counter` |
| Documents sources | `source_file`, `drawing`, `drawing_annotation`, `measurement` |
| Référentiels | `technical_reference` (version, date, domaine, source, statut de vérification), `material`, `supplier` |
| Prix | `price_item`, `price_history` (anciennes valeurs, provenance, zone, statut) |
| CCTP | `cctp_document`, `cctp_section`, `work_item` (ouvrage, lien CCTP ↔ DPGF) |
| DPGF | `dpgf`, `dpgf_line` (chapitres, sous-chapitres, postes, source des quantités et des prix) |
| Sous-détails | `price_breakdown`, `price_breakdown_component` |
| Devis | `quote`, `quote_line`, `quote_event` |
| Devises | `currency_rate` (taux, nature, source, date et heure) |
| IA et traitements | `generation_job`, `generation_step`, `generation_artifact`, `agent_run`, `ai_usage_record` |
| Qualité et traçabilité | `quality_issue`, `document_version` |
| Système | `audit_log`, `notification` |

La chaîne de traçabilité est portée par des clés étrangères :
plan (`drawing`) → mesure (`measurement`) → ouvrage (`work_item`) → prescription (`cctp_section`)
→ ligne DPGF (`dpgf_line`) → prix (`price_item`) / sous-détail (`price_breakdown`) → ligne de devis (`quote_line`).

## 5. Sécurité

- **Un seul administrateur** : `ADMIN_EMAIL` (variable serveur). Chaque route `/api/admin/*` vérifie la session
  **et** l'adresse de l'utilisateur. La création de tout autre compte est refusée en base (crochet Better Auth).
- **Aucune inscription** : la route d'inscription est désactivée ; le compte est créé en ligne de commande
  (`npm run admin -- create`), le mot de passe est saisi dans le terminal et n'est jamais écrit dans le code.
- **Double authentification** : TOTP (application d'authentification) + codes de secours ; **obligatoire** pour
  accéder à l'API métier. Connexion par passkey (WebAuthn). Verrouillage du compte après échecs répétés du second facteur.
- **Sessions** : cookies `HttpOnly`, `Secure`, `SameSite=Lax`, préfixés ; expiration ; liste des sessions
  (appareil, adresse IP, date) ; révocation de toutes les sessions.
- **Tentatives répétées** : limitation stockée en base (fonctionne en serverless), règles renforcées sur la connexion.
- **Journal d'audit** : connexions réussies et échouées, actions sensibles, exports, modifications de prix validés.
- **Requêtes** : origine vérifiée sur les requêtes modifiantes, validation Zod des entrées, requêtes SQL paramétrées.
- **Fichiers** : compartiment privé, jamais dans `public/` ; URL signées de courte durée ; taille limitée ;
  type réel vérifié (signature binaire) ; empreinte SHA-256 ; suppression logique puis définitive.
- **IA** : clé OpenAI côté serveur uniquement ; contenus des documents traités comme des données, jamais comme des
  instructions (protection contre l'injection de consignes) ; plafond de dépenses ; journal des appels et coûts.
- **Indexation** : `/administration` et `/api` en `noindex` ; aucune donnée privée dans le HTML statique.
- **Secrets** : uniquement dans les variables d'environnement Vercel / `.env.local` ; `vite.config.ts` refuse tout
  secret préfixé `VITE_`.

## 6. Traitements longs

`generation_job` (une génération) se découpe en `generation_step` persistées :
en attente → analyse → extraction → planification → génération → contrôle → mise en page → terminé.
Un appel au point de traitement exécute **une étape** puis enregistre son résultat ; il est déclenché tout de suite
après la création du traitement, et par une tâche planifiée Vercel (reprise après interruption). Chaque étape est
idempotente (clé d'idempotence, verrou à durée limitée) ; la progression affichée est celle des étapes terminées.

## 7. Phases

| Phase | Contenu |
| --- | --- |
| A | audit, architecture, Neon + migrations, authentification, protection des routes, lien Administration |
| B | interface (barre latérale, barre supérieure, palette), tableau de bord sur données réelles, clients, affaires, fichiers, paramètres |
| C | premier circuit IA complet sur le gros œuvre : plans → extraction → métrés → CCTP → DPGF → sous-détail → devis → exports |
| D | autres corps d'état, référentiels France / Maroc, bibliothèques avancées, contrôles croisés |
| E | tests complets, performance, supervision, documentation d'exploitation, restauration |

L'état d'avancement réel de chaque phase est suivi dans `docs/AVANCEMENT.md`.
