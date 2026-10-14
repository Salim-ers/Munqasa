# Démonstration : essayer la chaîne complète sur des données réelles

*Paramètres*, onglet *Démonstration*, bouton *Préparer la démonstration*. L'action peut être relancée sans rien
dupliquer. Elle ne saisit aucune quantité et aucun prix à la place de l'utilisateur.

## Ce que fait la préparation

| Élément | Effet |
| --- | --- |
| Référentiel vérifié | import du catalogue de départ, voir plus bas |
| Prix publics de 2022 | sur accord explicite (case cochée), ancienneté admise portée à 60 mois dans *Paramètres* > *Alertes* ; un seuil déjà plus large n'est jamais réduit |
| Une affaire par pays | « Démonstration : immeuble d'habitation R+3 à Casablanca » (MAD) et « Démonstration : logements collectifs R+2 à Lyon » (EUR), lots 01 Gros œuvre, 11 Menuiseries extérieures, 17 Carrelage / Faïence et 20 Plomberie / Sanitaire repris de la nomenclature par défaut |

Les affaires créées sont mémorisées : une affaire de démonstration supprimée est recréée à la préparation
suivante, sous une nouvelle référence ; une affaire existante n'est jamais modifiée. Chaque préparation est
inscrite au journal, ainsi que la création de chaque affaire et le changement du seuil d'ancienneté.

## Référentiel vérifié

Le catalogue de départ (*Référentiel* > *Catalogue de départ*, ou la démonstration) compte 42 références, 29 pour la France et 13 pour le Maroc. Chacune
a été vérifiée le 14 octobre 2026 sur sa source officielle et arrive « vérifiée », avec son lien, son édition et
une note qui dit où elle a été vérifiée. Seuls l'identifiant, l'intitulé et la source sont conservés, jamais le
contenu d'une norme payante.

| Pays | Références | Source de la vérification |
| --- | --- | --- |
| France | NF DTU 13.1, 13.3, 20.1, 21, 23.1, 25.41 P1-1, 26.1, 36.5, 52.2, 59.1, 60.1 P1-1-1 | boutique AFNOR, statut « en vigueur » et date de publication |
| France | NF EN 206+A2/CN, NF EN 13670 et son complément national, NF EN 197-1, NF A35-080-1, NF EN 771-3+A1 et son complément national, NF P94-500, NF C15-100-1 | boutique AFNOR |
| France | NF EN 1990, 1991-1-1, 1992-1-1, 1997-1, 1998-1 | boutique AFNOR |
| France | CCAG Travaux (arrêté du 30 mars 2021), décret n° 2010-1254 et arrêté du 22 octobre 2010 (risque sismique), décret n° 2021-1004 (RE2020) | Légifrance |
| Maroc | NM 10.1.004, 10.1.156, 10.1.157, 10.1.005 (ciments) | règles de certification NM Ciments de l'IMANOR (RCNM014, version 03) |
| Maroc | NM 10.1.008 (bétons), NM 10.1.353 (eau de gâchage) | règles NM Béton prêt à l'emploi de l'IMANOR (RCNM019, version 03) |
| Maroc | NM 01.4.095, 01.4.096, 01.4.097 (aciers pour béton armé) | règles NM Fers à béton de l'IMANOR (RCNM004, version 05) |
| Maroc | CCAG-T (décret n° 2-14-394), décret n° 2-22-431 relatif aux marchés publics | textes publiés par la Trésorerie générale du Royaume |
| Maroc | RPS 2000 version 2011 (décret n° 2-12-682), RTCM (décret n° 2-13-874, B.O. n° 6306) | ministère chargé de l'habitat ; texte du Bulletin officiel |

Les règles IMANOR ne précisent pas l'édition en vigueur de NM 10.1.008, NM 10.1.353 et des normes d'aciers :
leur édition reste vide plutôt que supposée.

L'import n'écrase jamais une saisie. Il ajoute les références absentes ; il complète celles qu'avait importées
l'ancien catalogue (« à vérifier », note d'origine intacte), y compris sous leur ancien code (NF EN 206/CN devient
NF EN 206+A2/CN, NF A 35-080-1 devient NF A35-080-1) ; il rejette le NF DTU 13.11, annulé et remplacé par le
NF DTU 13.1, s'il n'a pas été retouché. Une référence saisie, modifiée ou déjà vérifiée par l'utilisateur reste
telle quelle. Une référence vérifiée reste à revoir quand une nouvelle édition paraît : la modifier la remet
« à vérifier ».

## Prix publics de 2022

Ce sont les moyennes annuelles 2022 des prix de vente TTC des matériaux de construction, relevées par le
ministère chargé de l'habitat et publiées sur data.gov.ma (voir [BIBLIOTHEQUE-PRIX.md](BIBLIOTHEQUE-PRIX.md)) :
5 292 prix de fourniture, datés du 1er juillet 2022. Avec le seuil par défaut de 12 mois, ils sont historiques et
n'alimentent aucun chiffrage automatique. Le seuil porté à 60 mois les fait entrer dans les sous-détails et la
recherche de prix jusqu'en juillet 2027 ; les relevés de 2019 restent historiques.

Ils restent signalés comme tels : la provenance de chaque composant de sous-détail et de chaque poste porte la
mention « valeur 2022 », le prix TTC ramené hors taxes avec la TVA de 20 % qu'il inclut. Le seuil se règle à
tout moment dans *Paramètres* > *Alertes* ; le ramener à 12 mois retire ces prix des chiffrages automatiques.

## Ce que l'utilisateur apporte

- **Quantités** : plans déposés dans l'affaire puis *Générer le dossier* avec le métré, ou saisie dans l'onglet
  *Métré*. Sans quantité, la DPGF et le devis donnent des prix unitaires et des postes « à métrer ».
- **Main-d'œuvre** : aucune source publique ne donne un coût horaire chargé ; le SMIG, le SMIC et les minima
  conventionnels restent des bases de calcul, jamais repris tels quels. Les taux de l'entreprise se saisissent ou
  s'importent dans la *Bibliothèque*.
- **Prix posés** : aucune base publique actuelle de prix d'ouvrages posés n'existe en France ni au Maroc. Un
  bordereau de prix (référentiel du ministère de l'Équipement, BPU, ancien devis) au format Excel ou CSV
  s'importe dans la *Bibliothèque* avec la correspondance des colonnes.

## Parcours conseillé

Préparer la démonstration, ouvrir l'affaire de Casablanca, déposer un plan, *Générer le dossier* avec le métré,
le CCTP, la DPGF, les sous-détails et le devis : le CCTP cite les normes NM et les textes marocains du référentiel,
les sous-détails chiffrent les matériaux avec les prix de 2022 de Casablanca, le contrôle avant export dit ce qui
reste à compléter. L'affaire de Lyon montre le référentiel français ; ses postes restent à chiffrer tant que la
bibliothèque n'a pas de prix français actuels.
