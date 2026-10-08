# Talab Solutions, site vitrine

Gestion et accompagnement des appels d'offres au Maroc. *De l'avis à la soumission.*

React 19, TypeScript, Vite 8, React Router 8, GSAP (ScrollTrigger, SplitText), Lenis, Lucide.

```bash
npm install
npm run dev        # http://localhost:5173 (le formulaire fonctionne : les demandes s'affichent dans le terminal)
npm run build      # vérification TypeScript + build de production dans dist/
npm run preview    # sert dist/ en local
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
api/            fonction serveur Vercel : POST /api/contact
build/          plugins Vite : SEO statique par route, API de développement
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
- Au changement, la nouvelle lumière balaie la page de gauche à droite (View Transitions) ; les photos visibles sont
  chargées avant le balayage. Mouvement réduit : bascule instantanée.
- Seule la version de la lumière active est téléchargée.

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

`npm run logo` décline les deux fichiers fournis, sans aucun redessin :

- **jour** : le logo terracotta (`assets-src/brand/talab-logo-terracotta-source.png`), utilisé tel quel ;
- **nuit** : le logo bronze (`assets-src/brand/talab-logo-source.png`) en version blanche : seul le noir passe en
  ivoire, l’or et la végétation gardent leurs couleurs.

L’en-tête affiche le logo de la lumière active (les deux versions sont empilées, la place réservée est celle de la plus
large). Le pied de page affiche le mot-symbole TALAB SOLUTIONS : terracotta le jour, blanc et or la nuit. Le favicon et
les icônes reprennent le logo de jour (le bâtiment seul pour les petites tailles), l’image de partage le logo de nuit.

## Formulaire de contact

`POST /api/contact` : validation serveur (schéma partagé `src/lib/contact.ts`), nettoyage des entrées, champ piège,
délai minimal de saisie, contrôle d'origine, limitation de débit (5 envois / 10 min / IP, en mémoire par instance),
e-mail en texte brut via Resend. Aucun envoi de fichier : les dossiers d'appel d'offres peuvent contenir des
informations sensibles. Sans configuration Resend, l'API répond 503 en production.

## Déploiement (Vercel)

`vercel.json` définit le build, les URL propres, les en-têtes de sécurité (CSP stricte, HSTS, nosniff, frame-ancestors,
Permissions-Policy) et le cache des assets. Le build écrit un HTML par route avec ses propres balises (title,
description, canonical, Open Graph, JSON-LD), ainsi que `sitemap.xml`, `robots.txt` et `404.html`.

Renseigner dans Vercel : `VITE_SITE_URL`, `RESEND_API_KEY`, `CONTACT_TO`, `CONTACT_FROM`.

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
