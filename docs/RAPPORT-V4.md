# Rapport final : amélioration professionnelle V4 de Talab Solutions

Période : octobre 2026. Dix phases livrées, chacune vérifiée, enregistrée et déployée en production
(https://munqasa.vercel.app) avant la suivante. Grille de tests et preuves des critères d'acceptation :
`docs/V4-AUDIT-ET-TESTS.md`. Détail phase par phase : `docs/AVANCEMENT.md`.

| Phase | Enregistrement | Objet |
| --- | --- | --- |
| 1 et 2 | e3126ad | Audit, corrections critiques du chiffrage et du métré |
| 3 | 930f753 | Moteur de composition et contrôle automatique du rendu |
| 4 | e982e0a | Double authentification désactivée temporairement par la configuration |
| 5 | 1ea9619 | Catalogue numéroté des lots, sous-lots et sélecteur |
| 6 | a07806d | Bibliothèques de prix, sources publiques et prix historiques |
| 7 | 3e089cd | Module de devis complet |
| 8 | 67f4298 | Chaîne des agents et contrôle avant export |
| 9 | 3ce21f2 | Parcours de création d'une affaire |
| 10 | 280f5be | Validation complète et corrections |

## Ce qui existait déjà

Avant la mission V4, l'application disposait de : la gestion des affaires, clients, prospects, échéances et
documents ; la lecture des plans par le texte vectoriel et un métré tracé cote par cote ; les agents CCTP, DPGF
et sous-détails ; la génération du dossier en un traitement, le contrôle indépendant et les niveaux de
validation ; les exports Word, Excel et PDF à l'identité Talab ; une bibliothèque de prix sourcée (matériaux
marocains, prix d'ouvrages de rénovation et ratios d'opération français) ; l'authentification avec double
authentification obligatoire ; 164 tests serveur et 19 parcours navigateur.

## Ce qui a été réellement développé

- **Moteur de composition documentaire** : couverture en flux, titres toujours solidaires de leur contenu,
  chapitres et sommaires sans page résiduelle, colonnes ajustées, tableaux et résultats insécables, contrôle
  automatique de chaque fichier produit (PDF relu sur les coordonnées réelles, Word et Excel sur leur structure)
  avec recomposition et anomalies dites, jamais masquées.
- **Catalogue des lots** : 30 lots numérotés et sous-lots modèles, modèles par type d'opération, nomenclatures
  personnalisables, sélecteur avec recherche, favoris, récents et suggestions des plans.
- **Bibliothèques de prix** : trois sources publiques de plus (salaires minimaux et indemnités du BTP de la base
  KALI avec le SMIC, prix des carburants, SMIG marocain), quarantaine, historique, annulation, prix historiques
  jamais repris d'office, premier chargement automatique au déploiement.
- **Module de devis** : création vierge ou depuis une affaire, une DPGF, le métré ou la bibliothèque, moteur
  financier déterministe aux règles écrites, régimes de TVA, statuts, versions figées, exports, préparation par
  l'IA sans quantité ni prix inventés, contrôle avant export.
- **Chaîne des agents** : documents à produire et lots choisis au lancement, seuls les agents nécessaires
  travaillent, documents existants repris, un CCTP et une DPGF par lot, agent de recherche de prix, agent de
  devis, identifiants d'ouvrages partagés.
- **Contrôle avant export** en quinze points (ouvrages, lots, unités, quantités, formules, prix, pertes, taxes,
  totaux, doublons, références des documents et réglementaires, mise en page, pagination, statuts) sur le
  dossier, l'index du dossier complet et chaque devis.
- **Création d'une affaire** en un parcours (affaire, lots, documents, production), avec préremplissage depuis
  le cartouche des plans, chaque valeur vérifiée mot pour mot sur un plan.
- **Double authentification** isolée derrière `TALAB_2FA`, désactivée sans affaiblir le reste.

## Ce qui a été corrigé

- Pertes comptées deux fois dans les sous-détails (consommations déjà majorées), corrigées aussi sur les données
  existantes par le contrôle indépendant.
- Sous-détails vides suivis de totaux à 0,00 : état « décomposition impossible », jamais de coût nul supposé.
- Valeurs inconnues imprimées « 0,00 » ou « 0 » : totaux partiels nommés comme tels, montants à établir.
- Statut « Validé » imprimé d'office : statut calculé sur les données et les anomalies ouvertes.
- Défauts de mise en page relevés sur TAL-2026-0003 : couverture superposée, titres isolés, sommaire réduit à
  une ligne, colonne hors marge, montants absents des PDF.
- Métré relancé qui recréait un second ouvrage du même code à côté de l'ouvrage vérifié (quantité doublée dans
  la DPGF) : ouvrage vérifié conservé, codes jamais réattribués.
- Provenances longues non renvoyées à la ligne dans l'Excel du devis ; quantité modifiée dans un devis qui se
  disait encore reprise de la DPGF ; DPGF d'une autre affaire acceptée pour un devis ; prix à la tonne refusé
  pour un poste au kilogramme (conversion exacte ajoutée) ; récapitulatif du devis coupé entre deux pages.

## Migrations réalisées

Toutes additives (ajout de colonnes, de tables, de valeurs d'énumération), appliquées en production au
déploiement, sans suppression ni réinitialisation de données :

| Migration | Contenu |
| --- | --- |
| 0007_pertes_et_completude | état de décomposition et caractéristiques manquantes des sous-détails, mode de pertes des composants, données manquantes des ouvrages |
| 0008_catalogue_des_lots | catalogues et entrées de lots, sous-lots, favoris |
| 0009_valeurs_reglementaires | indicateur de valeur réglementaire des prix |
| 0010_devis_complets | champs complets des devis et des lignes, versions figées des devis |
| 0011_controle_avant_export | point d'audit des anomalies, contrôle des fichiers produits |

## Fichiers modifiés

169 fichiers depuis le début de la mission (69 ajoutés, 100 modifiés) ; liste exhaustive :
`git diff --name-status 90413d5 280f5be`. Par domaine :

| Domaine | Fichiers |
| --- | --- |
| Interface d'administration | 37 (pages des devis, assistant de création d'affaire, fenêtre de génération, contrôle avant export, catalogue des lots, bibliothèque, sécurité) |
| Services serveur | 25 (moteur des devis, contrôle avant export, contrôle qualité, préremplissage, prix et conversions d'unités, sources de prix, niveaux des documents) |
| Documents | 17 (composition, contrôle du rendu, couverture, devis, liste du dossier) |
| Base de données | 17 (schémas et migrations) |
| Traitements et agents | 15 (chaîne du dossier, rendu contrôlé, recherche de prix, devis par l'IA, lecture des plans) |
| Routes de l'API | 10 |
| Définitions partagées | 8 |
| Tests | 22 |
| Documentation | 5, plus ce rapport |
| Configuration, authentification, instantanés de prix et scripts | 13 |

## Tests exécutés et résultats

Derniers passages, le 12 octobre 2026, sur la version 280f5be :

| Suite | Résultat |
| --- | --- |
| Vérification des types (application, serveur, administration, scripts, tests) | aucune erreur |
| Tests serveur, base PostgreSQL réelle en mémoire, fournisseur d'IA simulé | 264 réussis sur 264 (25 fichiers) |
| Tests sur les fichiers réels : dossier TAL-2026-0003 recomposé, chaînes de cotes de PLAN METRIKA, DPGF réelle | 6 réussis sur 6 |
| Parcours navigateur, dont la création d'une affaire depuis un plan jusqu'à la génération | 22 réussis sur 22, aucune erreur dans le navigateur, aucun débordement sur téléphone |
| Construction de production | réussie |
| Déploiements de production | chaque phase « Ready », migrations appliquées, `/api/health` correct, routes d'administration protégées |

Les fichiers privés (TAL-2026-0003, PLAN METRIKA, DPGF) restent hors du dépôt et ne sont lus que par chemin.

## Nombre réel de références tarifaires intégrées

Décompte fait en base de production par le chargement au déploiement :

| Pays | Publiées | Détail |
| --- | --- | --- |
| France | 879 | 739 valeurs réglementaires (salaires minimaux et indemnités du BTP en vigueur, SMIC), 27 prix de carburants, 39 prix d'ouvrages de rénovation (ADEME), 74 ratios d'opération (Caisse des dépôts) ; 3 références de plus restent en quarantaine, en attente de décision |
| Maroc | 7 393 | 7 392 prix de matériaux du référentiel ministériel (84 matériaux, 88 zones), 1 salaire minimum légal (SMIG) |

Ces références sont toutes sourcées (producteur, licence, période, méthode). Aucune n'a été inventée ni
convertie d'un pays à l'autre.

## Problèmes encore présents

- **Couverture des prix pour le chiffrage automatique** : les sources publiques chargées ne contiennent aucun
  prix d'ouvrage posé récent. Les matériaux marocains datent de 2019 et 2022 et les ouvrages et ratios français
  dépassent le seuil d'ancienneté : ils sont signalés comme historiques et jamais repris d'office. Les salaires
  français sont des minima réglementaires, pas des taux de facturation, et sont exclus du chiffrage
  automatique. En l'état, la recherche de prix, les sous-détails et le devis par l'IA trouvent donc rarement un
  candidat : il faut importer des prix propres (devis fournisseurs, DPGF chiffrées, bordereaux). Aucune source
  publique n'est chargée pour la location de matériel, le transport ou la sous-traitance.
- **Totaux de la DPGF** : ses lignes de total font partie du tableau des postes ; elles ne sont pas encore
  gardées d'un seul tenant comme le récapitulatif du devis. Aucune coupure n'a été relevée par les contrôles,
  mais elle n'est pas exclue sur une DPGF dont le tableau finit en bas de page.
- **Préremplissage depuis les plans** : limité aux PDF vectoriels ; un plan scanné ou une image n'apporte rien,
  les champs se complètent à la main.
- **Performances en production** : les contrôles du dossier sont désormais rejoués en parallèle, mais le temps
  du contrôle avant export n'a pas été mesuré en production sur un dossier volumineux.
- **Double authentification** : désactivée par la configuration, comme demandé ; `TALAB_2FA=obligatoire` la
  rétablit (secrets, codes de secours et clés conservés).
- **Hors périmètre, sans bouton factice** : envoi des devis par courriel (seul l'envoi fait par l'utilisateur est
  enregistré) et transformation d'un devis accepté en suivi de chantier (module inexistant).

## Fonctionnalités nécessitant encore une validation métier

- Métré proposé par l'agent et classement des ouvrages par lot sur plusieurs lots.
- Contenu des CCTP (prescriptions, normes citées) et correspondance avec la DPGF.
- Hypothèses de consommation des sous-détails et choix de prix de l'agent de recherche (postes « à vérifier »).
- Coefficients du devis (frais de chantier, frais généraux, aléas, marge), régimes de TVA et mentions légales,
  taux de TVA tenus pour courants en France et au Maroc.
- Seuils des contrôles (pertes au-delà de 25 %, gravités des anomalies de rendu).
- Nomenclature interne des lots et modèles par type d'opération.
- Lecture des barèmes KALI par région et des cartouches sur un plus grand nombre de plans réels.

Le niveau 9/10 visé reste à confirmer par des tests métier et des revues humaines indépendantes. Aucun contrôle
automatique de la plateforme ne certifie la conformité structurelle, réglementaire ou contractuelle d'un dossier.
