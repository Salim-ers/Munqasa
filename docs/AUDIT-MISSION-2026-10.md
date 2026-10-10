# Audit et plan d'exécution : amélioration complète de Talab Solutions

Audit réalisé le 10 octobre 2026, avant toute modification, sur le dépôt, la production (munqasa.vercel.app) et
les trois fichiers d'exemple fournis : `TAL-2026-0001 CCTP lot 01 Gros œuvre.docx`,
`TAL-2026-0001 DPGF lot 01 Gros œuvre.xlsx` et `PLAN METRIKA.pdf`.

## 1. L'existant

### Pile technique

| Partie | Technologies |
| --- | --- |
| Site vitrine | Vite, React, pages statiques, thème jour et nuit (`src/`) |
| Administration | React 19, React Router, TanStack Query et Table, Radix, Tailwind 4 (`admin/`) |
| API | Hono sur une fonction Vercel de 300 s (`api/index.ts`, `server/`) |
| Base | Neon PostgreSQL en production, PGlite en local et dans les tests, Drizzle, 4 migrations additives |
| Authentification | Better Auth : mot de passe, double authentification, clés d'accès, compte unique |
| Stockage | Compartiment S3 privé (Cloudflare R2) en production, dossier local en développement |
| IA | API OpenAI Responses, sorties structurées validées par schéma, fournisseur simulé pour les tests |

### Données (44 tables)

Affaires, lots, échéances, clients et prospects ; fichiers sources ; planches et éléments relevés ; ouvrages
(`work_item`) et mesures (`measurement`, avec formule, valeurs et sources) ; référentiel technique ; CCTP
(document et sections) ; DPGF (lignes arborescentes) ; sous-détails et composants ; bibliothèque de prix
(prix, historique, fournisseurs) ; versions figées ; points de contrôle ; traitements longs et leurs étapes ;
journal d'activité ; réglages ; notifications ; tables de devis sans écran.

### Chaîne IA actuelle

| Agent | Entrée | Sortie | Garde-fous |
| --- | --- | --- | --- |
| Lecture des plans et métré | PDF découpé page par page, envoyé en image au modèle | Relevé par planche, ouvrages et mesures proposés | Quantités calculées par le serveur (formules, décimal exact) |
| Rédaction du CCTP | Affaire, lot, métré, références cochées | Plan puis chapitres en blocs structurés | Citations limitées au référentiel, contrôle qualité |
| DPGF depuis le CCTP | CCTP et métré | Postes par chapitre, quantité du métré, forfait ou « à métrer » | Aucun prix proposé, contrôle qualité |
| Sous-détails de prix | DPGF et bibliothèque | Composants chiffrés avec les prix de la bibliothèque | Le modèle ne donne aucun coût, calcul exact |

Traitements longs : étapes persistées, verrou, tranches de temps, relance automatique, reprise, annulation,
plafond de dépense, journal des exécutions.

### Exports existants

CCTP en Word (couverture, sommaire, annexe des références), DPGF en Excel (formules de sous-totaux et de TVA),
sous-détails en Excel. Aucun PDF, aucun BPU, DQE, estimation, note de métré, rapport ni dossier ZIP.

### Tests

117 tests d'intégration (Vitest sur PGlite) et 16 parcours dans un vrai navigateur (Playwright), dont un
contrôle d'affichage téléphone sur 14 écrans.

## 2. Ce que montrent les fichiers d'exemple

**PLAN METRIKA.pdf** : 12 planches A1 (plans de niveaux au 1/50, coupes au 1/20, façades, VRD, plantations)
d'un projet en phase PRO de 11 logements. Toutes les planches portent une **couche de texte vectorielle**
exploitable, de 142 à 632 mots par planche :

- cotes en mètres (`2.77`, `36.70`) et en centimètres (`80`, `90`) ;
- surfaces de pièces (`33.73 m²`) ;
- codes de menuiseries (`ME 02`, `H2.15 L90`) ;
- niveaux NGF ;
- cartouche pivoté portant l'échelle (`Echelle 1 : 50`).

**CCTP version 3** (480 paragraphes) : structure correcte et prudence justifiée sur les données absentes.
Il présente pourtant les défauts suivants :

- aucune quantité ;
- aucune référence normative ;
- de nombreuses clauses générales « à préciser » ;
- une présentation neutre.

**DPGF version 2** (24 postes) : 11 forfaits, 13 postes « à métrer », aucun prix, libellé de TVA
« 20,0000 % ».

La désignation de l'affaire (SCCV MOUY, Maroc) diffère des cartouches (Ferrières-sur-Ariège, France). Selon
la consigne, ce n'est pas une erreur de fonctionnement ; l'agent l'a d'ailleurs signalé.

## 3. Causes des défauts et remèdes

| Défaut | Cause | Remède |
| --- | --- | --- |
| Quantités absentes | Lecture des plans impossible en production sans stockage R2 ; lecture visuelle seule | Exploitation du texte vectoriel, vérification par le serveur de chaque cote citée, métré enrichi, chaîne automatique |
| Traçabilité incomplète | Mesure reliée à la planche, sans indice, confiance, déductions ni provenance | Champs persistés : indice, page, dimensions, formule, déductions, confiance, provenance |
| Prix absents | Bibliothèque vide, aucun rapprochement avec la DPGF | Bibliothèque initiale sourcée, rapprochement automatique, prix manquants signalés |
| Prescriptions génériques | CCTP organisé en chapitres généraux | Rédaction par ouvrage (fiche ouvrage), contrôle des clauses répétitives |
| Références absentes | Référentiel vide en production | Catalogue de départ, contrôle de traçabilité des références |
| Présentation neutre | Modèles par défaut | Système documentaire Talab : couverture, en-têtes, thèmes jour et nuit |
| Pas de contrôle global | Contrôles par document seulement | Agent d'audit transversal avec reprise automatique des erreurs calculables |

## 4. Risques de régression et protections

- **Base** : migrations uniquement additives (création de tables, ajout de colonnes et de valeurs
  d'énumération). Aucune suppression, aucune réinitialisation ; les anciennes données restent lisibles.
- **Exports** : tests de non-régression sur le contenu des exports existants (structure, formules, montants)
  avant toute refonte.
- **Agents** : les tests existants sont conservés. Les nouvelles étapes restent compatibles avec les
  traitements déjà enregistrés.
- **Authentification, stockage et site vitrine** : inchangés.

## 5. Plan d'exécution

| Phase | Contenu |
| --- | --- |
| B | Système documentaire Talab : charte réelle, thèmes jour et nuit, polices du site embarquées (licence SIL OFL), logos jour et nuit, motif d'arche |
| C | Moteur d'export : un modèle documentaire unique rendu en Word, PDF et Excel ; BPU, DQE, estimation, note de métré, rapports, bibliothèque de prix ; dossier ZIP |
| D | Bibliothèques de prix Maroc et France : recherche de sources réutilisables, schéma étendu, observations sources, statuts, mise à jour périodique avec quarantaine, interface |
| E | Agents : texte vectoriel, vérification des cotes, métré par lot avec provenance et confiance, CCTP par ouvrage, DPGF avec rapprochement des prix |
| F | Audit automatique, chaîne « Générer le dossier » avec progression réelle, espace de résultats, niveaux de validation |
| G | Tests : anciens et nouveaux parcours, calculs, exports volumineux, PDF de plusieurs pages, formules Excel |
| H | Bilan : fonctions réellement en service, migrations, tests, limites |

## 6. Décisions et limites connues

- **Comptes clients** : la mission évoque des clients disposant d'un espace personnel et une isolation des
  données entre clients. L'application réserve aujourd'hui l'accès à votre seul compte, selon la consigne
  initiale. Ouvrir des comptes clients changerait le modèle de sécurité : l'accès unique est conservé tant
  que vous n'en avez pas décidé autrement. La chaîne automatique et l'espace de résultats fonctionnent dans
  votre administration.
- **Prix publics** : les données essentielles des marchés publics donnent des montants globaux de contrats,
  les bordereaux joints aux dossiers de consultation sont le plus souvent vierges, et les bases
  professionnelles sont payantes. La bibliothèque initiale ne contiendra que des prix sourcés et
  réutilisables, et leur nombre réel sera indiqué.
- **Arabe** : Word reçoit une police arabe et la mise en forme de droite à gauche. Dans les PDF, les mots et
  paragraphes arabes sont correctement formés ; les lignes mêlant fortement arabe et français restent à
  vérifier au cas par cas.
- **Génération réelle sur votre dossier** : elle appelle OpenAI avec votre clé, qui n'existe qu'en
  production. Les parties déterministes (lecture du texte vectoriel, calculs, exports) sont testées ici sur
  vos fichiers ; la génération complète se lance ensuite en production.
