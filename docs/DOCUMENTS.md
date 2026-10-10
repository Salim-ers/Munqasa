# Moteur documentaire

Tous les documents produits par Talab Solutions passent par `server/documents/`. Une seule lecture de la
base alimente chaque format (Word, PDF, Excel, CSV) : les versions éditables et les PDF ont toujours le même
contenu.

## Organisation

| Fichier | Rôle |
| --- | --- |
| `brand.ts` | Charte reprise du site : couleurs (`src/styles/tokens.css`), polices, logos jour et nuit, arche brisée (`src/lib/arch.ts`), palettes claire et sombre, échelle typographique, marges |
| `model.ts` | Modèle documentaire unique : métadonnées de couverture et blocs (titres, paragraphes, listes, exigences, notes, encadrés, fiches, tableaux, références) |
| `render-pdf.ts` | Rendu PDF par pdfmake, sans navigateur : couverture, en-têtes et pieds de page, sommaire, titres jamais isolés en bas de page, tableaux dont l'en-tête se répète |
| `render-docx.ts` | Rendu Word par docx : mêmes contenus, vrais styles, sommaire actualisable, polices embarquées, thème sombre |
| `xlsx.ts` | Classeurs Excel aux couleurs de la charte : bandeau avec logo, en-tête figé et filtrable, impression A4 |
| `builders/` | Lecture de la base et construction du modèle pour chaque type de document |
| `registry.ts` | Formats disponibles par type, rendu, versions figées, bibliothèque de prix |
| `zip.ts` | Dossier complet d'une affaire, avec index |
| `words.ts` | Montants en toutes lettres (bordereau des prix) |

## Documents et formats

| Document | Formats | Identifiant |
| --- | --- | --- |
| CCTP | Word, PDF | CCTP |
| DPGF | Excel (feuilles DPGF et Synthèse), PDF | DPGF |
| BPU | Excel, PDF, prix en chiffres et en lettres | DPGF |
| DQE | Excel, PDF | DPGF |
| Estimation des travaux | Excel, PDF, postes non chiffrés listés | DPGF |
| Sous-détails de prix | Excel, PDF | DPGF |
| Note de métrés | Excel, Word, PDF | affaire |
| Rapport d'analyse des plans | Word, PDF | affaire |
| Rapport de contrôle qualité | Word, PDF | affaire |
| Bibliothèque de prix | Excel, CSV, PDF | filtres |
| Version figée d'un CCTP ou d'une DPGF | Word ou Excel, PDF | version |
| Dossier complet | ZIP | affaire |

Routes (administration, jamais mises en cache) :

- `GET /api/admin/exports/:type/:id/:format?theme=clair|sombre` ;
- `GET /api/admin/exports/version/:id/:format` ;
- `GET /api/admin/exports/dossier/:affaire` ;
- `GET /api/admin/exports/bibliotheque/:format?pays=&nature=&statut=&q=` ;
- les anciennes adresses (`/cctp/:id/export.docx`, `/dpgf/:id/export.xlsx`, `/dpgf/:id/breakdowns/export.xlsx`)
  passent par le même moteur.

## Règles

- **Thèmes.** Clair par défaut, pour l'impression. Le thème sombre change seulement les couleurs ; dans
  Excel, il colore le bandeau et l'en-tête, et les cellules de saisie restent claires.
- **Formules.** Dans Excel, les montants, sous-totaux, taxe et totaux sont des formules. Les quantités du
  métré sont des formules écrites avec leurs valeurs (`ROUND((42.5)*(0.6)*(0.4),4)`), et les totaux du métré
  excluent les mesures rejetées.
- **Données absentes.** Une quantité ou un prix absent n'est jamais compté comme zéro. Il est affiché
  « à métrer » ou « à chiffrer » et signalé.
- **Couverture.** Le statut affiché ne dit jamais « conforme » ni « validé » sans validation enregistrée.
  Les rapports automatiques portent la mention qu'ils ne valent pas certification.
- **Polices.** Instrument Serif, Manrope et Noto Sans Arabic sont sous licence SIL Open Font License
  (`assets/fonts/OFL-*.txt`). Les versions complètes remplacent celles du site, qui sont réduites. Les
  espaces fines insécables (U+202F) sont remplacées par des espaces insécables.
- **Arabe.** Les passages en arabe reçoivent la police arabe et l'écriture de droite à gauche dans Word.
  Dans les PDF, les mots arabes sont correctement formés ; une ligne mêlant beaucoup d'arabe et de français
  doit être relue.
- **Robustesse.** Le rendu est indépendant des traitements IA : un export qui échoue se relance sans rien
  recalculer. Dans le dossier ZIP, un document non produit est signalé dans l'index sans bloquer les autres.

## Ajouter un type de document

1. Écrire un constructeur dans `builders/` qui renvoie un `DocModel`, et un classeur si le document est tabulaire.
2. Déclarer ses formats dans `FORMATS` et la portée de son identifiant dans `ID_SCOPE` (`registry.ts`).
3. Ajouter son rendu dans `renderExport`, puis l'entrée du menu « Télécharger » dans l'écran concerné.
4. Couvrir le contenu dans `tests/server/exports.test.ts`.

## Production

`vercel.json` embarque explicitement `server/documents/assets/**`, ainsi que le module et les tables de
caractères de pdf.js. La page Système vérifie le moteur documentaire : elle rend un PDF puis relit son texte.
