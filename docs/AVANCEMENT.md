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

## Mission d'amélioration complète (octobre 2026)

Audit et plan : `docs/AUDIT-MISSION-2026-10.md`. Moteur documentaire : `docs/DOCUMENTS.md`. Bibliothèque de
prix : `docs/BIBLIOTHEQUE-PRIX.md`. Lecture des plans et métré : `docs/METRE-TRACABILITE.md`. Dossier, contrôle et niveaux de validation :
`docs/DOSSIER.md`.

| Phase | Contenu | État | Vérification |
| --- | --- | --- | --- |
| A | Audit de l'existant, des sorties d'exemple (CCTP, DPGF, PLAN METRIKA) et des risques ; tests de non-régression des exports avant refonte | fait | tests de non-régression (contenu du CCTP Word, formules de la DPGF) |
| B | Identité documentaire : charte réelle du site, polices du site embarquées, logos jour et nuit, arche, thèmes clair et sombre | fait | rendu contrôlé visuellement sur le CCTP réel (38 pages), Word relu dans LibreOffice |
| C | Moteur d'export : CCTP, DPGF, BPU (prix en lettres), DQE, estimation, sous-détails, note de métrés, rapports d'analyse et de contrôle, bibliothèque de prix, versions figées, dossier ZIP ; menu « Télécharger » sur chaque document | fait | 14 tests d'export (contenu identique Word et PDF, formules Excel, gros CCTP de 240 articles) + parcours navigateur |
| D | Bibliothèques de prix sourcées : 7 392 prix de fournitures au Maroc (84 matériaux, 88 zones, ministère, ODbL), 39 prix d'ouvrages de rénovation (ADEME) et 74 ratios d'opération (Caisse des Dépôts) en France ; provenance, licence, période, fourchette, fiabilité, HT ou TTC ; lots contrôlés avec quarantaine, publication, rejet et annulation ; actualisation manuelle et planifiée par empreintes ; interface par pays avec filtres, fiche, série publiée, comparaison, doublons ; rapprochement des postes de DPGF ; prix TTC ramenés HT dans les sous-détails | fait | 16 tests (lecteurs, quarantaine, annulation, proximité, conversion HT, filtres, rapprochement DPGF, actualisation, planification), valeurs recoupées avec les classeurs d'origine, parcours navigateur avec les 7 505 références chargées |
| E | Agents : texte vectoriel des plans transmis à l'agent et contrôle de chaque cote relevée, échelle et indice lus, règles de lot ; métré tracé cote par cote (origine de chaque entrée, concordance, déductions explicites, quantités brute et nette, confiance déterministe) ; CCTP garantissant un article par ouvrage ; bilan des prix de bibliothèque à la fin de la DPGF ; note de métrés et rapport d'analyse enrichis | fait | tests sur un PDF vectoriel (cotes retrouvées ou absentes, échelle, indice, confiance, déductions, correction manuelle), tests unitaires du texte vectoriel et de la confiance, couche texte vérifiée sur le plan d'exemple (149 à 370 textes par page, échelles 1/50 et 1/75 lues) |
| F | Chaîne « Générer le dossier » en un traitement (plans, métré, CCTP, DPGF, sous-détails, contrôle) avec progression réelle et reprise exacte ; contrôle indépendant qui recalcule tout, corrige et journalise les erreurs calculables, rejoue tous les contrôles et date son empreinte ; cinq niveaux de validation calculés sur l'état réel ; déclaration de validation professionnelle liée aux versions des documents ; onglet Dossier et rapport de contrôle enrichi | fait | 5 tests sur base réelle (génération complète, motifs des étapes écartées, corrections automatiques, progression jusqu'à la validation professionnelle et retour en arrière après modification), parcours navigateur de la génération simulée, ordinateur et téléphone sans débordement |
| G | Parcours navigateur des nouvelles fonctions (source publique chargée, quarantaine examinée, fiche et comparaison, rapprochement DPGF, génération du dossier), contrôle sans débordement de l'onglet Dossier sur téléphone ; tests sur les fichiers d'exemple de l'affaire TAL-2026-0001 (texte vectoriel et échelles des 12 planches de PLAN METRIKA, import de la DPGF d'exemple), exécutés quand leurs chemins sont fournis, ces documents privés n'étant pas versionnés | fait | 164 tests serveur, 2 tests sur les fichiers d'exemple, 19 parcours navigateur, aucune erreur dans le navigateur |
| H | Bilan de la mission | fait | section « Bilan de la mission » ci-dessous |

## Amélioration professionnelle V4 (octobre 2026)

Grille de tests et constats d'audit : `docs/V4-AUDIT-ET-TESTS.md`.

| Phase | Contenu | État | Vérification |
| --- | --- | --- | --- |
| 1 | Audit du code et des documents de TAL-2026-0003 (couvertures, pagination, sous-détails, DPGF, métré) ; tests de référence | fait | 164 tests serveur et 19 parcours navigateur au vert avant toute modification ; défauts mesurés page par page sur les PDF de l'affaire |
| 2 | Pertes appliquées une seule fois (quantité nette, taux, quantité brute, montant ; consommation qui comprend déjà les pertes détectée et corrigée sur les données existantes par le contrôle indépendant) ; décomposition impossible dite sans tableau vide ni total à zéro ; coût nul, non renseigné, partiel, estimatif ou calculé ; totaux partiels nommés comme tels, jamais « 0,00 » pour un prix inconnu ; statut imprimé calculé (brouillon, généré avec réserves, vérification automatique réussie, prêt pour revue, validé par un professionnel) ; chaînes de cotes reconstituées et contrôlées à l'échelle ; métré des postes restés à métrer à partir des planches lues, données manquantes dites précisément | fait | 187 tests serveur (dont 18 sur le calcul des pertes et des états de coût, 6 de bout en bout sur le chiffrage, 5 sur le métré), chaînes vérifiées sur PLAN METRIKA |
| 3 | Moteur de composition : couverture en flux (plus aucune superposition, titre dimensionné d'après sa longueur, paysage pris en charge), titre toujours solidaire du bloc qui le suit (place calculée avec les métriques des polices), chapitres sur nouvelle page sauf fin de chapitre très courte, sommaire sans page résiduelle, colonnes élargies jusqu'à leur plus long mot et contenues dans la page, résultats de sous-détails insécables, sous-détails en paysage ; contrôle automatique après chaque export (PDF relu sur les coordonnées : marges, superpositions, pages presque vides, titres isolés, en-têtes, pieds et numérotation, couverture, contenu complet ; Word et Excel contrôlés sur leur structure), recomposition limitée à quatre essais, anomalies restantes dites dans l'export et dans l'index du dossier ZIP | fait | 9 tests de composition (CCTP de 3 à 92 pages, DPGF de 26 pages, sous-détails de 15 pages et plus, thème sombre, tableau large, contrôleur éprouvé sur un PDF défectueux), 21 exports de l'API à 0 anomalie, dossier réel TAL-2026-0003 recomposé à 0 anomalie (93 pages de sous-détails, 43 pages de CCTP, 14 pages de DPGF), Word converti par LibreOffice à 0 anomalie |
| 4 | Double authentification désactivée temporairement par la configuration (`TALAB_2FA` absente ; `TALAB_2FA=obligatoire` la rétablit) : module TOTP non chargé, aucun écran de code, garde serveur et page Sécurité adaptés ; secrets TOTP, codes de secours et passkeys conservés en base, sans migration ; mot de passe haché, limitation des tentatives, contrôle d'origine, compte unique, sessions et journal inchangés (la politique en vigueur est consignée à chaque connexion) | fait | 11 tests sans second facteur (connexion, 429, origine, compte unique, journal, sessions, puis réactivation qui accepte le code de la même application et nouvelle désactivation sans perte), 20 tests avec second facteur exigé, parcours navigateur de connexion sans code |
| 5 | Catalogue des lots : nomenclature interne indicative de 30 lots numérotés (01 Gros œuvre à 30 Piscines / Ouvrages spécifiques) avec sous-lots modèles (01.01 à 01.07, VRD, plomberie, électricité), modèles par type d'opération (bâtiment, logements, réhabilitation, VRD), nomenclatures par pays ; édition (numéros, intitulés, corps d'état, sous-lots, favoris, retrait, fusion, séparation, copie, nomenclature par défaut) ; sélecteur de lots (recherche instantanée, regroupement par corps d'état, sélection multiple, tout sélectionner, favoris, récents, suggestions de l'analyse des plans, lot personnalisé) ; lots recopiés dans l'affaire, jamais renumérotés ; fusion de deux lots d'une affaire tant que le lot absorbé n'a pas de document ; titre du CCTP et libellé de lot identiques sur tous les documents ; accès aux prix du corps d'état du lot | fait | 11 tests (nomenclature, modèles, ajout groupé sans renumérotation, catalogue modifié sans effet sur les affaires, suggestions des plans, fusion et séparation, favoris, copie, suppression, fusion de lots d'affaire refusée avec documents, titre et couverture du CCTP), parcours navigateur (sélection par recherche, onglet Lots des paramètres), affichage téléphone sans débordement |
| 6 | Bibliothèques de prix : trois sources publiques de plus, lues et contrôlées comme les autres (lots, quarantaine, historique, annulation) : salaires minimaux et indemnités de petits déplacements du BTP en vigueur (base KALI de Légifrance : ouvriers du bâtiment, ouvriers des travaux publics, ETAM du bâtiment, 13 régions et accords départementaux) avec le SMIC de l'Insee comme plancher, prix des carburants à la pompe (DGCCRF, médianes régionales du gazole et du sans-plomb 95-E10), salaire minimum légal marocain lu dans le Bulletin officiel ; prix historiques au-delà du seuil d'ancienneté jamais appliqués d'office, signalés dans la bibliothèque et le rapprochement de DPGF, une valeur réglementaire restant en vigueur tant que sa source est revérifiée (migration additive 0009) ; salaires minimaux et indemnités jamais repris tels quels par l'agent des sous-détails ; filtre par lot de la nomenclature ; premier chargement automatique au déploiement de production pour chaque source jamais chargée, avec le bilan réel dans le journal ; bilan de couverture documenté | fait | 10 tests (lecteurs KALI, carburants et SMIG sur des extraits réels, plancher du SMIC, barème à venir, tableaux en lignes, en colonnes et en phrases, prix historiques écartés du chiffrage automatique, filtre par lot, chargement des instantanés, instantané d'une ligne de DPGF et d'un sous-détail inchangé après une mise à jour de la bibliothèque, premier chargement unique), 225 tests serveur au vert ; en production : 879 références françaises publiées (739 valeurs réglementaires, 3 en quarantaine) et 7 393 marocaines |
| 7 | Module de devis (`docs/DEVIS.md`) : création vierge, depuis une affaire, une DPGF, le métré ou la bibliothèque, par lot ou sur plusieurs lots, informations connues préremplies ; moteur financier déterministe aux règles écrites (prix direct ou décomposé en fourniture et pose avec frais de chantier, frais généraux, aléas et marge appliqués une seule fois, remise de ligne et remise globale, TVA par taux avec répartition de la remise, autoliquidation, franchise, exonération motivée, acompte, totaux partiels jamais complétés par un zéro) ; prix incertains signalés et confirmés explicitement ; statuts brouillon, à vérifier, prêt à envoyer, envoyé, accepté, refusé, expiré ; verrouillage et version figée à chaque envoi, nouvelle version, duplication, archivage, historique ; « Générer mon devis avec l’IA » sans quantité ni prix inventés (sources vérifiées par le serveur) ; exports PDF, Excel en formules et Word contrôlés ; écrans liste et devis, accès depuis l’affaire et le tableau de bord (migration additive 0010) | fait | 14 tests (moteur vérifié à la main au centime près, partiels, régimes, ligne décomposée, création depuis DPGF, métré et bibliothèque, refus d’un ratio, cycle de vie complet avec verrou et versions, bibliothèque modifiée sans effet sur le devis, duplication, archivage, expiration, trois exports à 0 anomalie, total inconnu jamais imprimé à zéro, IA qui garde la quantité citée et écarte quantité et prix sans source), 239 tests serveur et 20 parcours navigateur au vert, affichage téléphone sans débordement |
| 8 | Chaîne des agents (`docs/DOSSIER.md`) : documents à produire et lots choisis au lancement, seuls les agents nécessaires travaillent, CCTP ou DPGF existants repris, dépendances vérifiées avant tout démarrage, accord d’envoi demandé seulement si un agent est appelé ; un CCTP et une DPGF par lot, plans lus une fois pour tous les lots ; agent de recherche de prix (candidats actuels de la bibliothèque, choix limité aux candidats, mêmes règles qu’un choix manuel) ; agent de devis sans IA depuis les DPGF des lots ; identifiants partagés (ouvrages vérifiés conservés au métré relancé, codes jamais réattribués, quantité saisie dite saisie) ; contrôle avant export en quinze points (ouvrages, lots, unités, quantités, formules, prix, pertes, taxes, totaux, doublons, références des documents et réglementaires, mise en page, pagination, statuts) sur le dossier, son index ZIP et chaque devis, fichiers produits rendus et relus par le contrôle indépendant, verdict jamais favorable avec une anomalie bloquante, contrôles rejoués avant chaque téléchargement ; défaut trouvé et corrigé : provenances longues non renvoyées à la ligne dans l’Excel du devis (migration additive 0011) | fait | 11 tests de la chaîne et du contrôle avant export, 250 tests serveur et 21 parcours navigateur au vert, affichage téléphone sans débordement |

## Bilan de la mission

**Ce qui fonctionne et a été vérifié**

- Documents à l'identité Talab (CCTP, DPGF, BPU, DQE, estimation, sous-détails, note de métrés, rapports,
  bibliothèque, dossier ZIP), en Word, Excel et PDF, versions claire et sombre, prise en charge de l'arabe.
- Bibliothèque de prix : 7 392 prix de fournitures au Maroc (84 matériaux, 88 zones), 39 prix d'ouvrages de
  rénovation et 74 ratios d'opération en France, tous sourcés (producteur, licence, ressource, période, méthode,
  fourchette, fiabilité, HT ou TTC) ; actualisation par lots contrôlés avec quarantaine et annulation ;
  rapprochement des postes de DPGF ; prix TTC toujours ramenés HT pour chiffrer.
- Lecture des plans appuyée sur le texte vectoriel des PDF, chaque cote contrôlée ; métré tracé cote par cote,
  déductions explicites, confiance déterministe ; règles de lot.
- CCTP couvrant chaque ouvrage du métré ; DPGF avec bilan des prix disponibles ; sous-détails chiffrés
  uniquement avec la bibliothèque.
- Chaîne « Générer le dossier » en un traitement, contrôle indépendant qui corrige les erreurs calculables,
  cinq niveaux de validation et déclaration de validation professionnelle.
- Migrations toutes additives (0004 à 0006), appliquées sur Neon au déploiement ; aucune donnée supprimée.

**Limites connues, dites telles quelles**

- Couverture des prix : aucune source publique marocaine accessible ne publie de prix d'ouvrages posés ; seuls
  les matériaux le sont. Les prix ADEME datent de 2009 à 2018 et ne sont pas actualisés : aucun indice n'est
  appliqué, ils restent signalés comme anciens. L'objectif de plusieurs centaines de références vérifiées par pays
  n'est atteint que pour les fournitures marocaines. La main-d'œuvre et le matériel viennent de vos propres prix.
- Contrôle des cotes : le serveur vérifie qu'une valeur relevée est bien écrite sur la page, pas sa position par
  rapport à l'élément ; une cote présente ailleurs sur la planche est donc comptée comme retrouvée.
- Le contrôle indépendant est déterministe : il recalcule et rejoue les contrôles, sans relecture par un second
  modèle.
- Comptes clients et espaces partagés : non réalisés, l'accès restant réservé à votre seul compte comme demandé.
- Formats DXF et IFC : lecture non disponible ; les plans se lisent en PDF ou en image.

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
4. **Première connexion** : la double authentification est désactivée par défaut (connexion par mot de passe). Pour l'exiger de nouveau, ajouter la variable Vercel `TALAB_2FA` avec la valeur `obligatoire` puis redéployer : vos réglages TOTP existants sont conservés et resservent tels quels.
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
8. **Prix et chiffrage** : dans *Bibliothèque de prix* > *Sources publiques*, charger les trois sources (un clic
   chacune) et examiner les deux valeurs en quarantaine ; importer ensuite vos prix (bordereaux, devis
   fournisseurs, anciennes DPGF), les vérifier, puis saisir frais généraux, aléas et marge dans *Paramètres* >
   *Chiffrage*. Les prix de main-d'œuvre et de matériel ne figurent dans aucune source publique : ils viennent de vous.
9. **Clé de session** : `BETTER_AUTH_SECRET` doit être longue et aléatoire (64 caractères hexadécimaux). Elle chiffre
   aussi la double authentification : après son remplacement et le redéploiement, celle-ci est réinitialisée
   automatiquement au déploiement ; se reconnecter avec le mot de passe et la réactiver (nouveau code QR,
   nouveaux codes de secours).
