# Talab Solutions : site vitrine et espace d'administration

Gestion et accompagnement des appels d'offres au Maroc. *De l'avis à la soumission.*

- **Vitrine** : React 19, TypeScript, Vite 8, React Router 8, GSAP (ScrollTrigger, SplitText), Lenis, Lucide.
- **Administration (Talab Intelligence)** : application privée sous `/administration`, API Hono, Neon PostgreSQL
  (Drizzle), Better Auth, Tailwind CSS 4, Motion. Architecture : `docs/ARCHITECTURE.md` ; avancement : `docs/AVANCEMENT.md`.

```bash
npm install
npm run dev        # http://localhost:5173 : vitrine, administration (/administration) et API
npm run build      # vérification TypeScript (6 projets) + build de production dans dist/
npm run preview    # sert dist/ en local (API comprise ; TALAB_LOCAL=1 pour utiliser la base locale)
npm test           # tests serveur et schémas partagés, sur PostgreSQL embarqué
npm run test:e2e   # parcours complets de l'administration dans Chrome (base et stockage jetables)
```

## Structure

```
src/
  animations/   GSAP centralisé (plugins, courbes) et révélations déclaratives (data-reveal)
  components/   en-tête, menu mobile, footer, loader, transition de page, curseur, logo, sélecteur jour / nuit, photo
  sections/     sections de l'accueil (home/) et blocs partagés (shared/)
  pages/        une page par route
  hooks/        useGsap, useSmoothScroll (Lenis), useHeaderState, useRouteSeo…
  lib/          validation du formulaire (partagée avec le serveur), défilement, arche, stockage
  data/         contenus : routes et SEO, services, méthode, formules, photos
  styles/       design tokens, base, typographie, grille
api/            fonctions Vercel : POST /api/contact, et /api/* (API de l'administration)
admin/          application d'administration (entrée administration/index.html)
server/         API Hono, authentification, base de données (schéma, migrations), services
build/          plugins Vite : SEO statique par route, API et administration en local
docs/           architecture et avancement de l'administration
tests/          tests serveur et schémas (Vitest), parcours de bout en bout (Playwright)
scripts/        outils de production : logo, photos, génération d'images (OpenAI)
public/         images optimisées, logos détourés, polices auto-hébergées, favicons
```

Routes : `/`, `/services`, `/methode`, `/expertise`, `/contact` (bouton « Contact » de la barre de navigation ; les appels
à l’action « Confier un dossier » y mènent aussi), `/mentions-legales`, `/politique-confidentialite`, et une page 404.

## Jour / nuit

Tout le site est soit en jour, soit en nuit : couleurs (`html[data-theme]`, tokens dans `src/styles/tokens.css`) **et**
photographies. Chaque photo du site existe en deux versions : la nuit n’est pas un voile sombre, c’est une vraie
photographie de nuit, éditée à partir de la photo de jour (même cadrage), avec un éclairage chaud et oriental.

- Le choix est mémorisé (`localStorage`) et appliqué avant le premier rendu par `public/theme-init.js` : aucun flash.
- Au geste, le sélecteur glisse aussitôt ; puis la nouvelle lumière balaie la page de gauche à droite
  (View Transitions), en fondu enchaîné sur écran tactile. Les photos et le logo visibles sont chargés juste avant
  (attente plafonnée) et les transitions CSS sont coupées le temps de la bascule : la page est peinte en une fois.
  Mouvement réduit : bascule sans animation.
- Seule la version de la lumière active est téléchargée (photos et logo : classes `.tpic__day` / `.tpic__night`,
  règles globales dans `src/styles/base.css`).

## Mobile et tablette

- **Téléphone** : cibles tactiles de 44 px (logo, sélecteur jour / nuit, liens du pied de page) ; en-tête sur une
  ligne dès 280 px (téléphone pliant fermé) ; à l’horizontale, en-tête resserré et séquence « Le dossier » en deux
  colonnes.
- **Tablette portrait** (600 à 1023 px) : hero lisible (voile depuis le bas, titre agrandi), arche des Services à côté
  du texte, chronologie de la Méthode avec action et livrable côte à côte, formules sur deux colonnes.
- **Tablette paysage** (1024 à 1279 px) : voile du hero élargi sous le texte.
- Séquence « Le dossier » sur écran étroit : frise du temps sur toute la largeur, documents de référence rangés
  dessous, onglets des dossiers à la largeur de chaque dossier.
- **Fluidité sans survol** (écran tactile ou télécommande : `(hover: none)`, `src/lib/device.ts`) : défilement
  natif seul (pas de Lenis), en-tête et sélecteur opaques sans flou d’arrière-plan, effets de parallaxe légèrement
  lissés (`SCRUB` dans `src/animations/gsap.ts`), fondu au lieu du balayage pour le changement de lumière.
- **Formules** (accueil) : une carte s’éclaire comme la formule mise en avant (fond clair, filet et bouton d’accent,
  légère montée) au survol de la souris, au focus du clavier ou de la télécommande, et, sans survol, quand elle
  traverse le milieu de l’écran au défilement.

## Navigateurs, appareils et résolutions

- **Navigateurs pris en charge** : depuis 2020, soit Chrome et Edge 79, Firefox 78 ESR, Safari et iOS 14, ainsi que
  les téléviseurs connectés récents. `build.target` réécrit la syntaxe plus récente. Le code du site n’utilise que
  les fonctions ES2020 : `tsconfig.app.json` refuse les plus récentes à la compilation.
- **Replis CSS** pour les navigateurs antérieurs à 2022 :
  - unités de conteneur des scènes (`--cq`, estimée en vw sans requêtes de conteneur) ;
  - proportions sans `aspect-ratio` ;
  - `translate` / `rotate` séparés ;
  - hauteur d’écran `--screen-h` (svh ou vh) ;
  - `overflow-x: clip` ;
  - transparences en `rgb(var(--…-rgb) / a)` à la place de `color-mix()` ;
  - focus visible sans `:focus-visible` ;
  - fond opaque sans flou d’arrière-plan.

  Ces replis passent par des variables et `@supports` : le minifieur CSS ne peut pas les supprimer.
- **Très grands écrans** (au-delà de 1920 × 1080 : moniteurs 2K, 4K, ultra-larges, téléviseurs) : tout le site
  grandit proportionnellement, d’après la dimension la plus contraignante. Les tailles d’interface sont en rem.
- **Filets de sécurité** :
  - contenu de secours dans `index.html` si l’application ne démarre pas (JavaScript désactivé ou bloqué,
    navigateur trop ancien) ;
  - page d’incident à la place du message technique du routeur ;
  - rechargement automatique, une fois, si une page chargée à la demande a été remplacée par une mise à jour.
- **Polices** : préchargées par `public/theme-init.js`, avec `crossorigin` sauf sous WebKit (Safari, iOS). Chaque
  moteur ne réutilise le préchargement que sous cette forme, sinon la police est téléchargée deux fois.
- **Contrôle** : parcours complet sous Chromium, WebKit (moteur de Safari) et Firefox, du téléphone pliant (280 px)
  à la 4K, en jour et en nuit.

## Motion design par page

- **Accueil** : séquence « Le dossier » (voir ci-dessous), index des services avec aperçu photo au survol.
- **Services** : chaque service est montré en action dans une scène animée au défilement
  (`src/components/ServiceScene`) : avis triés par vos critères, règlement surligné, attestation périmée
  remplacée, critères reliés à l’offre, contributions qui convergent, revue avec écart corrigé, pli scellé, suivi archivé.
- **Méthode** : calendrier horizontal épinglé (ordinateur), chaque livrable se « remet » au passage ; chronologie
  verticale sur mobile ; l’échange avec l’entreprise traverse l’arche du logo.
- **Expertise** : cartes empilées qui se recouvrent, photographies en parallaxe, bandeau des secteurs qui accélère avec
  le défilement.

Règle commune : le CSS « naturel » décrit l’état final (affiché tel quel avec `prefers-reduced-motion`), le CSS sous
`no-preference` décrit l’état de départ, et le défilement fait passer de l’un à l’autre.

## Une photo, un seul emplacement

Aucune photographie n’apparaît deux fois sur le site. Avant d’en placer une, vérifier toutes les occurrences de
`photo("…")`, `photo: "…"` et `image="…"` dans `src/` ; les usages sont listés dans `image-sources.json`.

## Accueil

Une idée par section, aucune redite : hero (promesse), séquence « Le dossier » (une consultation devient un dossier
déposé à temps, animée au défilement), index des services (photo au survol), grande photographie, formules. L’appel
final vit dans le pied de page, commun à toutes les pages.

## Variables d'environnement

Copier `.env.example` vers `.env.local` (ignoré par Git).

| Variable | Rôle | Exposée au navigateur |
|---|---|---|
| `OPENAI_API_KEY` | génération d'images (outil local uniquement) | **non** |
| `OPENAI_IMAGE_MODEL` | facultatif, force un modèle d'image | non |
| `RESEND_API_KEY`, `CONTACT_TO`, `CONTACT_FROM` | envoi des demandes du formulaire | **non** |
| `VITE_SITE_URL` | URL canonique (canonical, sitemap, Open Graph) | oui (non secrète) |

Le build échoue si une variable sensible porte le préfixe `VITE_`.

## Images

### Photographies (Unsplash)

```bash
npm run images:fetch      # télécharge la sélection dans assets-src/photos/ et écrit image-sources.json
npm run images:optimize   # AVIF + WebP en 640 / 1024 / 1600 (/ 2560) px + src/data/photo-manifest.json
```

Chaque photo a été vérifiée : aucun humain, aucun logo, aucun texte lisible. Crédits et usages : `image-sources.json`
(également affichés dans les mentions légales).

### Hero jour / nuit (OpenAI)

Outil de production : il tourne sur ta machine, une fois, et dépose des images statiques dans `public/images/`.
Le site public n'appelle jamais OpenAI, et la clé n'existe que dans `.env.local`.

```bash
npm run hero            # jour → nuit (éditée à partir du jour) → recadrage commun → WebP → contrôle
```

- Modèles : `gpt-image-2` (2560×1440 natif) puis repli automatique sur `gpt-image-1` (1536×1024) si le compte n'y a pas
  accès. Chaque repli est affiché dans le terminal.
- La nuit n'est **jamais** générée seule : c'est une édition de l'image jour, qui ne change que la lumière.
- Sorties : `hero-day.webp`, `hero-day-1920.webp`, `hero-day-1280.webp` et leurs équivalents `hero-night-*`.
- Sources et prompts : `assets-src/generated/hero/` (`manifest.json`, planche de contrôle `hero-compare.webp`).

Itérer :

```bash
npm run hero:day -- --count 3                       # 3 propositions jour
npm run hero:night -- --from assets-src/generated/hero/hero-day-02.png --count 3
npm run hero:finalize -- --crop-y 0.6               # décale le recadrage 16:9 (0 = haut, 1 = bas)
```

Contrôle « même bâtiment » : la finalisation compare les contours jour et nuit (exposition neutralisée).
Au-dessus de 0,70 : identique ; entre 0,50 et 0,70 : à vérifier ; en dessous : différent, relancer la nuit. La décision finale se prend à l'œil sur
`hero-compare.webp`.

### Photographies de nuit (OpenAI)

```bash
npm run images:night                      # version nuit de chaque photo qui n’en a pas encore
npm run images:night -- rampart --force   # régénère une photo précise
npm run images:optimize                   # décline jour et nuit en AVIF / WebP
```

Prompts : `scripts/prompts/night.ts` (extérieurs : arches allumées, lumière dorée, motifs de moucharabieh ; intérieurs :
lumière de lanterne). Sources : `assets-src/generated/night/<nom>.webp`, avec un score de géométrie par photo dans
`manifest.json`. Contrôle visuel obligatoire avant publication.

### Visuels éditoriaux générés (facultatifs)

```bash
npm run images:generate -- dossier | analyse | architecture | all
```

Sorties dans `public/images/generated/`. À utiliser seulement si aucune photographie réelle ne convient, après
vérification (humains, texte, logos, géométrie).

### Logo

`npm run logo` publie les dix fichiers fournis (`assets-src/brand/`, fond transparent), sans aucun redessin, avec le
même lettrage et les mêmes dimensions de jour comme de nuit :

- **jour** : logo noir et terracotta (`talab-day-*.png`) ;
- **nuit** : logo noir, blanc et or (`talab-night-*.png`).

Chaque fichier est décliné en logo complet, symbole, symbole réduit, mot-symbole et mot-symbole réduit. Le PNG est publié
tel quel ; le WebP affiché par le site est quasi sans perte (contours et lettrage intacts, écart imperceptible).

Ils servent dans l’en-tête, dans le pied de page (mot-symbole TALAB SOLUTIONS), en filigrane (symbole réduit, déjà
chargé par l’en-tête) et sur l’écran de chargement, qui prend la lumière du site (fond ivoire et logo noir et
terracotta le jour, fond nuit et logo or la nuit). Seule la version de la lumière active est téléchargée.

Favicons : le bâtiment, version jour pour les onglets clairs, version or pour les onglets sombres
(`prefers-color-scheme`). Icônes d’application (Apple, 192, 512 et « maskable ») : symbole de jour sur fond ivoire.
Image de partage : logo or sur fond nuit. La couleur de la barre du navigateur suit la lumière du site.

### Couleurs d’accent

Tout ce qui est terracotta le jour (boutons, sélecteur jour / nuit, curseur, transitions de page, animations) passe en or
la nuit : `--accent` (terracotta / or) pour les aplats et les traits, `--accent-ink` (terracotta / or bruni) pour les
marques posées sur le papier clair des scènes, `--on-accent` pour le texte posé sur l’accent.

## Formulaire de contact

`POST /api/contact` : validation serveur (schéma partagé `src/lib/contact.ts`), nettoyage des entrées, champ piège,
délai minimal de saisie, contrôle d'origine, limitation de débit (5 envois / 10 min / IP, en mémoire par instance),
e-mail en texte brut via Resend. Aucun envoi de fichier : les dossiers d'appel d'offres peuvent contenir des
informations sensibles. Sans configuration Resend, l'API répond 503 en production.

## Espace d'administration

Point d'entrée : le lien « Administration » en bas du pied de page, qui mène à `/administration/connexion`.
La sécurité ne repose pas sur ce lien : chaque route de l'API (`/api/admin/*`) vérifie côté serveur la session,
l'adresse de l'administrateur (`ADMIN_EMAIL`) et la double authentification.

```bash
npm run db:migrate                  # applique les migrations (Neon si DATABASE_URL, sinon base locale .data/)
npm run admin -- create             # crée le compte ADMIN_EMAIL (mot de passe saisi masqué)
npm run admin -- status             # état : double authentification, passkeys, sessions
npm run admin -- reset-password     # récupération : nouveau mot de passe, sessions fermées
npm run admin -- reset-2fa          # récupération : double authentification à réactiver
npm run admin -- revoke-sessions    # ferme toutes les sessions
npm run db:generate                 # nouvelle migration après une modification du schéma (server/db/schema)
```

- **Développement local** : sans `DATABASE_URL`, une base PostgreSQL embarquée (PGlite) est créée dans `.data/`
  avec les mêmes migrations ; aucune base Neon n'est nécessaire pour travailler.
- **Production** : `DATABASE_URL`, `BETTER_AUTH_SECRET` et `ADMIN_EMAIL` sont obligatoires ; sans elles, l'API
  refuse de démarrer. Les migrations s'appliquent au déploiement.
- **Compte unique** : aucune inscription ; la création de tout autre compte est refusée en base.
- **Connexion** : mot de passe puis code TOTP (ou code de secours), ou passkey. Double authentification obligatoire.
  Sessions de 12 h, limitation des tentatives, journal des connexions (page Sécurité).
- **Modules** : tableau de bord, affaires (lots, échéances, documents, historique), clients, prospects, agenda,
  notifications, paramètres (entités émettrices, identité documentaire, IA, alertes), système (connexions,
  sauvegarde, journal).
- **Fichiers** : stockés dans un compartiment privé compatible S3 (Cloudflare R2), envoyés et téléchargés par URL
  signée de courte durée ; en développement, dans `.data/storage`. Le type réel est vérifié à la réception.
- **Tâche planifiée** : chaque matin (Vercel Cron, `CRON_SECRET`), rappels d'échéance et nettoyage des envois
  abandonnés.
- **Prévisualisation locale du build** : `npm run preview` applique les en-têtes de `vercel.json` (CSP comprise).
  Comme `NODE_ENV` vaut alors `production`, ajouter `TALAB_LOCAL=1` pour utiliser la base et le stockage locaux.

## Déploiement (Vercel)

`vercel.json` définit le build, les URL propres, les en-têtes de sécurité (CSP stricte, HSTS, nosniff, frame-ancestors,
Permissions-Policy) et le cache des assets. Le build écrit un HTML par route avec ses propres balises (title,
description, canonical, Open Graph, JSON-LD), ainsi que `sitemap.xml`, `robots.txt` et `404.html`.

Renseigner dans Vercel : `VITE_SITE_URL`, `RESEND_API_KEY`, `CONTACT_TO`, `CONTACT_FROM`, et pour l'administration
`DATABASE_URL` (intégration Neon), `BETTER_AUTH_SECRET`, `ADMIN_EMAIL`, `APP_URL` (domaine personnalisé),
`OPENAI_API_KEY`, `CRON_SECRET` et les variables `S3_*` du compartiment R2 (voir `docs/AVANCEMENT.md`). Les routes `/administration/*` sont réécrites vers l'application d'administration, servie
en `noindex`.

## Accessibilité et mouvement

`prefers-reduced-motion` : pas de Lenis, pas de curseur, pas de scènes épinglées ni de parallaxe ; fondus courts
uniquement. Lien d'évitement, focus visible, menu mobile modal (Échap, focus piégé), libellés et erreurs de formulaire
reliés aux champs, focus ramené au contenu après chaque navigation.

## À compléter avant la mise en ligne

Aucune de ces informations n'a été inventée :

- domaine définitif (`VITE_SITE_URL`) ;
- mentions légales : raison sociale, forme juridique, siège, RC / ICE / IF, directeur de la publication, hébergeur ;
- numéro de déclaration CNDP (politique de confidentialité) ;
- e-mail et téléphone de contact, si souhaités : `src/data/site.ts` ;
- configuration Resend pour recevoir les demandes.

## Licences

Polices Instrument Serif et Manrope : SIL Open Font License. Photographies : licence Unsplash.
