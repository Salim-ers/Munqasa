# Amélioration V4 : constats d'audit et grille de tests

## Constats d'audit sur TAL-2026-0003 (phase 1)

Mesures faites sur les PDF et classeurs du dossier réellement généré (script de contrôle de mise en page sur
les coordonnées de chaque ligne de texte, lecture des classeurs Excel).

| Domaine | Constat | Cause dans le code |
| --- | --- | --- |
| Métré | Note de métrés « Aucune mesure » : 15 ouvrages, 0 mesure ; 39 postes de DPGF sur 65 sans quantité | lecteur de plans ne rattachant aucune cote aux murs, métreur consigné de ne rien mesurer à la moindre entrée manquante, aucun métré des postes créés par la DPGF |
| Pertes | Béton des bandeaux : 1,03 m³ × 809,27 × 1,03 = 858,55 au lieu de 833,55 ; même défaut sur 12 composants | consommation proposée déjà majorée, taux de pertes appliqué en plus par le calcul |
| Sous-détails | 3.3.1, 4.1.1, 4.1.2, 4.2.1, 5.2.3, 5.3.1, 5.3.2, 5.4.1 : tableaux vides suivis de totaux à 0,00 MAD | aucun état « décomposition impossible », sommes des composants inconnus présentées comme nulles |
| Montants | Déboursés « 0,00 MAD », total DPGF « 0 », récapitulatif des métrés « 0 » pour des valeurs inconnues ; montants des totaux absents des PDF | coût inconnu compté comme zéro ; rendu PDF qui avalait la cellule suivant une cellule fusionnée |
| Statuts | « Statut : Validé » sur les couvertures malgré 39 quantités et 65 prix manquants | statut de validation de l'utilisateur recopié tel quel sur la couverture |
| Mise en page | Avertissement de couverture superposé à la grille d'informations (sous-détails, BPU, estimation) ; titres isolés en bas de page (CCTP p. 25, sous-détails p. 28, 31, 39, 41, 44, 58, 70, 74, note de métrés p. 3, 6, 7) ; page de sommaire réduite à une ligne (CCTP p. 4) ; colonne « Cotes contrôlées » hors marge (rapport d'analyse p. 3) | couverture tracée en positions absolues ; contrôle des titres limité au cas où rien ne les suit ; sommaire suivi d'un saut de page forcé ; largeurs de colonnes non ajustées |

## Grille de tests reproductible

Chaque ligne est un test automatisé, rejoué par `npm test` (serveur, base PostgreSQL réelle en mémoire,
fournisseur d'IA simulé) ou `npm run test:e2e` (navigateur). Les tests sur les fichiers privés de l'affaire
s'exécutent quand leurs chemins sont fournis (`TALAB_SAMPLE_PLAN`, `TALAB_SAMPLE_DPGF`).

### Calculs financiers (`tests/server/pricing.test.ts`, `tests/server/chiffrage.test.ts`)

| Cas | Résultat attendu |
| --- | --- |
| Consommation nette 1 m³, pertes 3 %, 809,2673 | quantité brute 1,03, montant 833,5453 |
| Consommation 1,03 m³ comprenant déjà 3 % | quantité brute 1,03, montant 833,5453, jamais 858,5517 |
| Main-d'œuvre, matériel, transport, frais de chantier | pas de pertes, frais de chantier hors déboursé sec |
| Frais généraux sur DS, aléas sur DT, marge 15 % | chaque taux appliqué une fois sur son assiette, prix au centime |
| Arrondi | prix de vente au centime, demi supérieur (10,005 donne 10,01) |
| Aucun prix | état « non renseigné », aucun prix de vente, jamais 0,00 |
| Une partie des prix | état « partiel », déboursé « partiel, x MAD » |
| Consommations proposées par l'agent | état « estimatif » |
| Coût réellement nul | état « nul » |
| Justifications réelles de TAL-2026-0003 | pertes reconnues comme déjà comprises (8 cas) ; consommation nette ou « hors pertes » jamais confondue |
| Données déjà enregistrées avec double comptage | corrigées par le contrôle indépendant, correction journalisée |
| DPGF sans prix | total « non chiffré », statut « Généré avec réserves », aucun 0,00 |
| DPGF partiellement chiffrée | « Total hors taxes, partiel : n poste(s) non chiffré(s) exclu(s) » |

### Statuts documentaires (`tests/server/chiffrage.test.ts`)

| Cas | Statut imprimé |
| --- | --- |
| Quantités ou prix manquants, ou aucune planche analysée | Généré avec réserves |
| Document complet, contrôles sans anomalie | Vérification automatique réussie |
| Document complet validé par l'utilisateur | Prêt pour revue, jamais « Validé » sans déclaration professionnelle |

### Métré (`tests/server/metre.test.ts`, `tests/server/agents.test.ts`, `tests/samples/samples.test.ts`)

| Cas | Résultat attendu |
| --- | --- |
| Cotes écrites « 2.77 », « 80 », « 404.93 » | 2,77 m, 0,80 m, altitude ignorée |
| Chaîne 1,55 + 0,80 + 4,83 et cote 7,18 | chaîne contrôlée à l'échelle, cote totale retrouvée |
| Cote isolée hors de l'écartement attendu | exclue de la chaîne |
| PLAN METRIKA, niveau 0 et niveau 2 | chaîne vérifiée 7,18 ; trame 13 × 2,77 = 36,01 ; cote totale 36,01 retrouvée |
| Poste de DPGF à métrer, cote relevée | quantité calculée par le serveur, ouvrage et mesure tracés dans la note de métrés |
| Poste de DPGF non mesurable | « À métrer : » suivi de la donnée manquante, aucune quantité supposée |
| Cote absente du texte vectoriel, déduction | confiance faible, déduction soustraite, correction manuelle tracée |

### Composition et mise en page (`tests/server/layout.test.ts`, `tests/server/exports.test.ts`, `tests/samples/dossier.test.ts`)

| Cas | Résultat attendu |
| --- | --- |
| CCTP court, CCTP de 40 à 100 pages | aucune anomalie : marges, superpositions, pages presque vides, titres isolés, en-têtes, pieds, numérotation, couverture, contenu complet |
| DPGF longue (288 postes) | aucune anomalie, colonnes dans la page, Excel imprimable (A4, largeur d'une page, en-tête répété, pied paginé) |
| Sous-détails sur plusieurs pages, en paysage | aucune anomalie, décompositions impossibles comprises |
| Thème sombre, titre et avertissement très longs | couverture sans superposition, corps du titre réduit au besoin |
| Tableau de sept colonnes, mots longs | aucun mot coupé dans les en-têtes, aucun dépassement de marge |
| PDF volontairement défectueux | dépassement de marge, superposition, page presque vide, en-tête et pied absents, contenu manquant détectés |
| Titre signalé seul en bas de page | recomposition avec un saut forcé avant lui, au plus quatre compositions |
| 21 exports de l'API (PDF, Word, Excel, thème sombre) | en-tête `x-talab-mise-en-page` à 0 |
| Dossier ZIP | index « Contrôle de mise en page » : fichiers contrôlés, anomalies restantes dites fichier par fichier |
| Dossier réel TAL-2026-0003 recomposé | 0 anomalie sur les sous-détails (93 pages), la DPGF (14 pages) et le CCTP (43 pages) ; béton des bandeaux à 833,5453 ; huit décompositions impossibles identifiées |

### Authentification et sécurité (`tests/server/auth-sans-2fa.test.ts`, `tests/server/auth.test.ts`, `tests/server/bootstrap.test.ts`)

| Cas | Résultat attendu |
| --- | --- |
| Connexion sans `TALAB_2FA` | session ouverte par mot de passe seul, aucun code demandé, API métier accessible |
| Routes du second facteur | indisponibles tant qu'il est désactivé (404) |
| Mot de passe | haché en base, jamais en clair |
| Mauvais mot de passe, tentatives répétées | 401, puis 429 |
| Origine étrangère | connexion et requêtes modifiantes refusées (403) |
| Visiteur, autre compte | 401, création de tout autre compte refusée |
| Journal | connexion consignée avec la politique en vigueur |
| Sessions | liste disponible, fermeture à la déconnexion |
| `TALAB_2FA=obligatoire` | second facteur de nouveau exigé (403 tant qu'il n'est pas activé) |
| Désactivation puis réactivation | secret et codes conservés ; le code de la même application est accepté sans nouvelle activation |

### Lots (`tests/server/lots.test.ts`, parcours navigateur)

| Cas | Résultat attendu |
| --- | --- |
| Nomenclature par défaut | 30 lots 01 à 30, sous-lots 01.01 à 01.07, modèles bâtiment, logements, réhabilitation, VRD créés une seule fois |
| Ajout groupé (01 déjà saisi « Gros oeuvre », 08, 01.04, lot personnalisé 31) | 08, 01.04 et 31 ajoutés ; 01 conservé tel quel, signalé ; 01.04 rattaché au lot 01 de l'affaire |
| Nomenclature modifiée (08 renommé et renuméroté) | lot 08 de l'affaire inchangé |
| Plans relus (semelle, voile, réseau, baie) | suggestions 01 (2 éléments), 03, 11, 12 |
| Fusion de lots d'affaire | ouvrages déplacés, lot absorbé retiré ; refusée si le lot absorbé a un CCTP |
| CCTP du lot « 01 Gros oeuvre » | titre « CCTP, lot 01 Gros oeuvre », couverture « Lot 01, Gros oeuvre » |
| Fusion, séparation, sous-lot, favori, copie, suppression de nomenclature | lots fusionnés archivés et sous-lots rattachés ; numéro déjà pris refusé ; dernière nomenclature jamais supprimée |
| Sélecteur dans le navigateur | recherche « gros » puis « plomberie », deux lots ajoutés, journal « Lots ajoutés » |

### Bibliothèques de prix (`tests/server/bibliotheque-v4.test.ts`, `tests/server/price-sources.test.ts`)

| Cas | Résultat attendu |
| --- | --- |
| Accords KALI de Bretagne 2025, 2026 et 2027 non étendu | barème 2026 repris, barème 2027 cité en note, 2025 ignoré |
| Coefficient 150 à 12,29 € de l'heure, SMIC à 12,31 € | 12,31 € retenu, mention du SMIC, date du 1er juin 2026 |
| Accord non étendu des Hauts-de-France, salaire mensuel seul | salaire ramené sur 151,67 heures, mention de l'accord non étendu |
| Barème de trois coefficients seulement | écarté, rien n'est repris pour la région |
| Indemnités en lignes avec note de bas de tableau, en colonnes, en phrases | 13 références en Bretagne, repas lu dans le texte de la Drôme et de l'Ardèche, barème de Provence-Alpes-Côte d'Azur lu en phrases |
| Travaux publics en colonnes, ETAM par niveau | salaire annuel ramené sur 1 820 heures ; niveaux A à H |
| Carburants : affichages de plus d'une semaine, Corse | écartés ; TVA de 13 % en Corse |
| Décret du SMIG extrait du Bulletin officiel, intitulé illisible | 17,92 MAD depuis le 1er janvier 2026 ; numéro du décret repris du catalogue ; article agricole seul ignoré |
| Prix de 2019, salaire minimal revérifié, prix récent | agent des sous-détails : prix récent seul ; liste des prix historiques : prix de 2019 seul |
| Prix d'ouvrage de 2018 dans le rapprochement d'une DPGF | proposé, marqué historique |
| Filtre par lot 17 et 01 | carrelage seul ; ciment sans sous-famille compris dans le gros œuvre |
| Mise à jour de la bibliothèque après chiffrage | ligne de DPGF et composant de sous-détail inchangés |
| Premier chargement rejoué | sources déjà chargées jamais relues ; bilan réel par pays |
