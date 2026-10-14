# Bibliothèque de prix : sources, méthodes et couverture

La bibliothèque réunit deux familles de prix :

- **vos prix** : saisis, importés d'un fichier (bordereau, devis, facture, ancienne DPGF) ou copiés d'une
  référence publique pour être adaptés ;
- **les références publiques** : données ouvertes de producteurs officiels, chargées et actualisées par lots
  contrôlés.

Chaque prix porte sa provenance, sa source et sa licence, sa date ou sa période, sa zone, sa portée
(fourniture seule, pose seule, fourniture et pose, ouvrage complet), son assiette fiscale (HT ou TTC, avec le
taux de TVA inclus), sa fiabilité, la nature de sa valeur (reprise de la source, calculée sur la source,
estimée) et son statut de validation professionnelle. Toute nouvelle valeur est historisée.

## Règles qui ne souffrent pas d'exception

- Aucun prix n'est inventé. Une valeur absente de la source reste absente ; une cellule vide ou nulle n'est
  jamais lue comme un prix à zéro.
- Aucun prix marocain n'est obtenu en convertissant un prix français, ni l'inverse : chaque source ne produit
  que des prix de son pays et de sa devise.
- Aucun montant global de marché n'est ramené au m² ou au m³. Les seuls rapports calculés le sont geste par
  geste, sur la quantité de ce même geste (ADEME, voir plus bas).
- Aucune base commerciale ou payante n'est lue.
- Un prix TTC est ramené hors taxes avec le taux de TVA qu'il inclut, connu et affiché ; un prix TTC sans taux
  n'est jamais utilisé pour chiffrer.
- Un prix de matériau (fourniture seule) ne chiffre jamais directement une ligne de DPGF : il sert aux
  sous-détails. Un ratio d'opération ne chiffre ni une ligne ni un composant : il sert à l'estimation globale.
- Un prix historique n'alimente jamais d'office un chiffrage (voir plus bas) ; un salaire minimum ou une
  indemnité conventionnelle n'est jamais repris tel quel comme coût horaire par un agent : c'est une base de
  calcul du déboursé, que l'économiste établit avec ses charges.
- Les prix utilisés dans une affaire sont des instantanés : une mise à jour de la bibliothèque ne modifie ni une
  ligne de DPGF, ni un composant de sous-détail, ni un devis déjà chiffrés.

## Sources publiques

### Maroc : prix et indices des matériaux de construction

- Producteur : ministère de l'Aménagement du territoire national, de l'Urbanisme, de l'Habitat et de la
  Politique de la ville, publié sur data.gov.ma.
- Licence : Open Data Commons Open Database License (ODbL).
- Ressources : 13 classeurs, un national (2005 à 2019) et un par région (2005 à 2022 pour la plupart).
- Contenu repris : feuilles « T1 », prix moyens de vente TTC en dirhams par variété de matériau et par année,
  au niveau national, régional et de l'agglomération. Les feuilles d'indices (T2, T3) ne sont pas reprises.
- Méthode : pour chaque zone et chaque variété, valeur de la dernière année publiée, série annuelle complète
  conservée. Pour une région, la publication régionale (2024) l'emporte sur les feuilles régionales du classeur
  national (2022), qui ont été révisées depuis pour quatre régions. Fourchette d'une région : plus basse et plus
  haute des moyennes de ses agglomérations la même année ; fourchette nationale : celles des régions.
- Fiscalité : prix TTC au taux normal de TVA de 20 % (Code général des impôts marocain), ramenés HT pour les
  sous-détails et la DPGF.
- Date de valeur : milieu de l'année de la moyenne (1er juillet).

**Couverture réelle : 7 392 prix localisés, 84 matériaux distincts, 88 zones** (niveau national, 12 régions,
75 agglomérations). Années : 2022 pour 5 292 prix, 2019 pour 2 100 (niveau national et régions de
Souss-Massa, Fès-Meknès et Béni Mellal-Khénifra, dont la publication s'arrête à 2019).

| Famille | Matériaux distincts |
| --- | --- |
| Structure et gros œuvre (aciers, agglomérés, hourdis, poutres, ciments, briques, BPE, granulats, moellons) | 17 |
| Enveloppe (châssis aluminium, volets roulants, tuiles, étanchéité) | 8 |
| Second œuvre (bois, quincaillerie, plâtre et chaux, peintures, vitrerie, carrelages, marbre et granit, parquet) | 30 |
| Lots techniques (sanitaires, robinetterie, canalisations, électricité) | 26 |
| Aménagements extérieurs (bordures, buses) | 3 |

Ce sont des **prix de fourniture**, relevés au détail : ils ne comprennent ni la pose ni les frais de chantier.
Aucune source publique marocaine accessible ne publie de prix unitaires d'ouvrages posés ; les prix d'ouvrage
marocains s'obtiennent par sous-détail (matériaux de cette source, main-d'œuvre et matériel saisis ou importés)
ou à partir de vos propres bordereaux et devis.

### France : coûts des travaux de rénovation énergétique

- Producteur : ADEME, publié sur data.gouv.fr et data.ademe.fr.
- Licence : Licence Ouverte version 2.0 (Etalab).
- Ressources : 6 tables (isolation, menuiseries, chauffage, eau chaude sanitaire, ventilation,
  photovoltaïque), près de 12 000 gestes relevés sur devis et factures du réseau FAIRE entre 2001 et 2018.
- Méthode : prix unitaire de chaque geste (coût total HT divisé par la surface d'isolant posée, par le nombre
  d'ouvertures, ou par la puissance installée ; coût de l'installation pour un équipement), puis médiane et
  quartiles par type de travaux, avec interpolation linéaire. Publication à partir de 20 gestes. Un geste sans
  quantité exploitable est écarté. Le coût total exclut les travaux induits (finitions, bardage, plâtrerie) que la
  source compte à part. Date de valeur : date médiane des devis et factures. Aucune actualisation.
- Fiscalité : euros HT.

**Couverture réelle : 39 prix d'ouvrage en fourniture et pose**, sur 24 types de travaux : isolation des
combles, des rampants, des murs par l'intérieur et par l'extérieur, du plancher bas (par isolant quand
l'effectif le permet), fenêtres, portes-fenêtres et portes, poêles, inserts, chaudières, pompes à chaleur,
chauffe-eau solaires et thermodynamiques, systèmes solaires combinés, ventilation mécanique, photovoltaïque.
Fiabilité selon l'effectif et la dispersion : 9 hautes, 23 moyennes, 7 faibles.

Ces prix datent de 2009 à 2018 selon les types de travaux : ils sont signalés comme anciens et doivent être
confrontés à des prix récents avant tout usage dans une offre.

### France : coûts des logements sociaux financés par la Caisse des Dépôts

- Producteur : Caisse des Dépôts, publié sur data.gouv.fr.
- Licence : Licence Ouverte version 2.0 (Etalab).
- Contenu : prix de revient médians des opérations de construction et de réhabilitation, au m² de surface
  utile et par logement, par région et par année de financement, en euros courants.
- Méthode : médiane publiée de la dernière année disponible de chaque région, série annuelle conservée. Une
  valeur nulle publiée signifie l'absence de donnée.
- Fiscalité : non précisée par la source.

**Couverture réelle : 74 ratios d'opération** (19 régions, années 2020 à 2025). Ce sont des ratios de
programmes entiers : ils servent à l'estimation globale, jamais au prix d'une ligne de DPGF ni d'un composant.
Au premier chargement, les deux ratios de réhabilitation de la Nouvelle-Calédonie, près de quatre fois la
médiane des autres régions, restent en quarantaine jusqu'à décision.

### France : salaires minimaux et indemnités de petits déplacements du BTP

- Producteurs : Direction de l'information légale et administrative (base KALI des conventions collectives,
  Légifrance), lue dans la copie JSON que publie la Fabrique numérique des ministères sociaux ; Insee pour le SMIC.
- Licence : Licence Ouverte version 2.0 (KALI) ; données de l'Insee réutilisables librement, y compris à des fins
  commerciales, source citée.
- Ressources : les conventions des ouvriers du bâtiment des entreprises de plus de 10 salariés (IDCC 1597), des
  ouvriers des travaux publics (IDCC 1702) et des ETAM du bâtiment (IDCC 2609), avec leurs accords régionaux et
  départementaux de salaires ; série 000822484 de l'Insee, montant du SMIC brut horaire.
- Méthode : pour chaque convention, chaque zone d'accord et chaque nature (salaires, indemnités), le texte le plus
  récent déjà en vigueur ; un barème signé mais à venir est cité en note. Les tableaux sont lus quelle que soit leur
  forme (zones en lignes ou en colonnes, sous-régions, barème écrit en phrases) ; un tableau dont la structure n'est
  pas reconnue avec certitude est écarté, jamais deviné, et la zone garde alors son accord précédent. Un salaire est
  ramené à l'heure : taux horaire de l'accord quand il le publie, sinon salaire mensuel sur 151,67 heures ou annuel
  sur 1 820 heures. Inférieur au SMIC horaire en vigueur, il est porté au SMIC, qui s'applique de droit, avec la
  mention. Un accord non étendu est repris avec cette mention. Quand une région a un accord régional et des accords
  de ses anciennes régions, seul l'ensemble le plus récent est gardé.
- Nature : valeurs réglementaires ou conventionnelles, en vigueur jusqu'à leur remplacement (voir *Prix
  historiques*). Salaires bruts hors charges patronales, congés payés et frais : jamais des taux de facturation.

**Couverture réelle : 742 références**, dont le SMIC horaire (12,31 € depuis le 1er juin 2026) :

| Convention | Salaires horaires minimaux | Indemnités de repas, de trajet et de transport |
| --- | --- | --- |
| Ouvriers du bâtiment, IDCC 1597 | 91, 13 régions | 285, 12 régions et 7 accords départementaux d'Auvergne-Rhône-Alpes |
| Ouvriers des travaux publics, IDCC 1702 | 84, 12 régions | 177, 12 régions, dont les anciennes régions de Nouvelle-Aquitaine et de Bourgogne-Franche-Comté |
| ETAM du bâtiment, IDCC 2609 | 104, 13 régions, niveaux A à H | sans objet |

Dates d'effet : 2026 pour 582 références, 2025 pour 97, 2024 pour 62 (dernier accord publié en Provence-Alpes-Côte
d'Azur et pour les travaux publics d'Auvergne-Rhône-Alpes). La Corse n'a pas d'accord récent pour les travaux publics.

### France : prix des carburants à la pompe

- Producteur : Direction générale de la concurrence, de la consommation et de la répression des fraudes, flux
  instantané publié sur data.economie.gouv.fr (près de 10 000 stations, mise à jour toutes les 10 minutes).
- Licence : Licence Ouverte version 2.0 (Etalab).
- Méthode : prix mis à jour dans les sept jours précédant le relevé le plus récent, affichages invraisemblables
  écartés ; médiane et quartiles par région et pour la France métropolitaine, à partir de 20 stations.
- Fiscalité : prix TTC, TVA de 20 % ou de 13 % en Corse (article 297 du code général des impôts) et accise sur
  les énergies comprises ; ramenés HT avec ce taux. Actualisation chaque semaine.

**Couverture réelle : 27 prix** (gazole et sans-plomb 95-E10, 13 régions et la métropole entière ; le sans-plomb
de Corse compte moins de 20 stations à jour et n'est pas publié). Intrants des sous-détails de matériel et de
transport, jamais des prix d'ouvrage.

### Maroc : salaire minimum légal

- Producteur : Secrétariat général du Gouvernement, édition arabe du Bulletin officiel.
- Conditions de réutilisation : textes officiels, non protégés par le droit d'auteur (loi n° 2-00, article 8).
- Méthode : montant et date d'effet repris de l'article du décret qui fixe le salaire minimum pour l'heure de travail
  dans les activités non agricoles ; chaque décret lu ajoute un point à la série. Un nouveau décret s'ajoute en
  complétant les ressources de la source.

**Couverture réelle : 1 référence**, le SMIG horaire : 17,92 MAD depuis le 1er janvier 2026 (décret
n° 2.25.983, Bulletin officiel n° 7469), 17,10 MAD en 2025 (décret n° 2.24.1122). Aucune source publique marocaine
réutilisable ne publie de taux de main-d'œuvre par métier, de location de matériel ni de transport.

### Bilan réel

Références contrôlées et publiées par le premier chargement (mêmes règles qu'un chargement manuel ; les valeurs
douteuses attendent une décision en quarantaine) :

| Pays | Références | Distinctes | Nature | Historiques au seuil de 12 mois |
| --- | --- | --- | --- | --- |
| Maroc | 7 392 | 84 matériaux | fourniture seule, TTC | 7 392 (années 2019 et 2022) |
| Maroc | 1 | SMIG | salaire minimum légal | 0, en vigueur |
| France | 742 | 60 | salaires minimaux et indemnités du BTP, SMIC | 0, en vigueur |
| France | 27 | 2 carburants | fourniture, TTC | 0 |
| France | 39 | 24 types de travaux | fourniture et pose, HT | 39 (2009 à 2018) |
| France | 74 | 4 ratios | ratios d'opération | 74 |

En production, après le déploiement du 12 octobre 2026 (journal du déploiement) : **879 références françaises
publiées**, dont 739 valeurs réglementaires, et 3 en quarantaine en attente de décision ; **7 393 références
marocaines publiées**. Le premier chargement de chaque déploiement écrit ce bilan dans son journal.

Lots couverts, par les familles de prix rattachées à la nomenclature par défaut :

- Maroc, fournitures : 01 Gros œuvre (1 496), 03 VRD (264), 08 Couverture (88), 09 Étanchéité (264),
  11 Menuiseries extérieures (352), 12 Menuiseries intérieures (352), 13 Serrurerie (264), 14 Cloisons (176),
  17 Carrelage (880), 18 Revêtements de sols (88), 19 Peinture (880), 20 Plomberie (1 584), 23 Électricité (704),
  26 Réseaux hydrauliques (616), 27 Aménagements extérieurs (88).
- France, ouvrages posés : 10 Façades (4), 11 Menuiseries extérieures (7), 15 Isolation (12), 20 Plomberie (3),
  21 Chauffage (12), 22 Ventilation (12), 23 Électricité (1).
- Tous lots : salaires minimaux, indemnités et carburants en France, SMIG au Maroc.

Données vérifiées : toutes les références publiées ont passé les contrôles automatiques ; aucune n'est encore
validée par un professionnel (statut *à vérifier* jusqu'à votre validation).

Données restant à compléter, faute de source publique réutilisable : prix d'ouvrages posés récents en France
(seuls ceux de l'ADEME, de 2009 à 2018, sont ouverts) et au Maroc, taux de main-d'œuvre chargés, location de
matériel, transport, sous-traitance. Ils se complètent par vos bordereaux, devis et factures, importés et vérifiés,
ou par sous-détail.

Sources examinées puis écartées : données essentielles de la commande publique (montants globaux de marchés,
non décomposables en prix unitaires, y compris les publications de collectivités sur data.gouv.fr), bordereaux de
prix des dossiers de consultation marocains (publiés sans prix), estimations de façades d'un acteur privé, coûts
actualisés de l'énergie de l'ADEME (coûts de production au mégawattheure, pas des prix de travaux), indices du coût
de la construction (jamais des prix unitaires), études et articles commerciaux sans données vérifiables, bases
commerciales ou payantes.

## Fiabilité

Indépendante de l'ancienneté, signalée à part :

- **haute** : moyenne ou médiane publiée par un organisme public, ou médiane calculée sur au moins
  100 observations dont le troisième quartile reste inférieur au double du premier ;
- **moyenne** : médiane calculée sur au moins 30 observations, quartiles dans un rapport de 3 au plus ;
- **faible** : moins de 30 observations ou dispersion plus forte.

Vos prix reçoivent une fiabilité proposée selon leur provenance (devis, facture ou base sous licence : haute ;
DPGF ou bordereau historique, catalogue : moyenne ; tableau personnel, saisie : faible), que vous pouvez modifier.

## Prix historiques

- Un prix est **historique** au-delà du seuil d'ancienneté des réglages d'alerte (12 mois par défaut, de 1 à
  120 mois) : sa date de valeur est antérieure au seuil.
- Une valeur réglementaire ou conventionnelle (SMIC, SMIG, salaire minimum ou indemnité d'un accord collectif)
  reste en vigueur jusqu'à son remplacement : elle n'est historique que si sa source n'a pas été revérifiée
  depuis le seuil.
- Un prix historique reste consultable et peut être choisi à la main, toujours signalé (*Historique, jamais
  appliqué d'office* dans la bibliothèque, *Historique, à confirmer* dans le rapprochement d'une DPGF ; le choix
  groupé « Retenir le premier prix proposé » l'ignore). Il n'est jamais proposé à l'agent des sous-détails ni à un
  chiffrage automatique. Le contrôle qualité signale un prix historique utilisé dans une DPGF ou un sous-détail.
- La démonstration propose, sur accord explicite, de porter le seuil à 60 mois pour que les prix publics de
  2022 servent aux chiffrages automatiques, toujours avec la mention « valeur 2022 » (voir
  [DEMONSTRATION.md](DEMONSTRATION.md)).

## Filtre par lot

La bibliothèque se filtre par lot de la nomenclature par défaut : chaque lot est rattaché à une famille de corps
d'état et à ses sous-familles de prix (`shared/lots.ts`). Depuis l'onglet *Lots* d'une affaire, *Prix de ce lot*
ouvre la bibliothèque filtrée sur ce lot, ou sur sa famille si le lot a été renommé.

## Chargement, actualisation, quarantaine et annulation

- **Premier chargement** : automatique au déploiement de production (`npm run prices:init`, après les migrations),
  pour chaque source active jamais chargée, depuis l'instantané livré avec l'application (`server/data/prix`), lu
  et contrôlé à partir des ressources officielles ; il ne dépend pas de la disponibilité des sites des producteurs.
  Une source déjà chargée, ou dont vous avez annulé le chargement, n'est jamais relue à cette étape. Le chargement
  manuel reste possible (*Bibliothèque de prix* > *Sources publiques*).
- **Actualisation** : manuelle ou planifiée (tâche quotidienne ; chaque source déjà chargée est vérifiée selon
  son intervalle : 7 jours pour les carburants, 30 pour les salaires du BTP et les matériaux marocains, 90 pour les
  autres sources). Les ressources sont téléchargées depuis leurs
  adresses officielles ; si leurs empreintes SHA-256 sont identiques à la dernière lecture, rien n'est relu et
  la date de vérification avance.
- **Contrôle de chaque valeur** ; une valeur douteuse part en quarantaine, jamais publiée d'office :
  - prix nul, négatif ou illisible : rejeté ;
  - unité différente de la valeur publiée, ou valeur plus ancienne que la valeur publiée : quarantaine ;
  - révision d'une même période au-delà du seuil de la source (30 % par défaut) : quarantaine ;
  - nouvelle période dont la variation annuelle moyenne dépasse ce seuil : quarantaine ;
  - nouvelle référence plus de trois fois au-dessus ou en dessous de la médiane des références sœurs (même
    référence dans les autres zones, même unité, au moins trois) : quarantaine ;
  - lot de moins de la moitié des références déjà publiées : tout le lot reste en attente.
- **Publication** : les valeurs saines sont publiées d'office si la source le permet (réglable), les autres
  attendent votre décision (publier ou écarter). Une valeur inchangée n'est pas réécrite.
- **Annulation** : tout lot publié s'annule (le plus récent d'abord) : les références qu'il a créées sont
  archivées, les valeurs qu'il a remplacées rétablies, chaque retour est historisé. Rien n'est supprimé. Un import
  de fichier s'annule de la même façon.
- Une référence absente d'une nouvelle lecture est conservée et signalée ; une référence que vous avez archivée
  n'est plus modifiée par les imports. La valeur d'une référence publique suit sa source : pour l'adapter,
  dupliquez-la dans vos prix.

## Utilisation par les agents et dans les documents

- **Sous-détails** : les prix candidats sont cherchés en plein texte dans la bibliothèque, même devise et même
  pays, hors prix historiques et hors valeurs réglementaires, puis classés par proximité : ville de l'affaire, sa
  région, niveau national, autres zones. Une seule
  déclinaison par référence est proposée. Le coût retenu est toujours hors taxes, avec la mention de sa source,
  de sa zone, de sa période et de la conversion éventuelle.
- **DPGF** : *Prix de la bibliothèque* propose, pour chaque poste, les prix d'ouvrage de même unité ;
  l'économiste choisit, rien n'est appliqué d'office. Le prix appliqué est hors taxes, sa provenance est
  inscrite sur la ligne et le poste passe à vérifier. Sans candidat, le poste est signalé « prix non disponible
  dans la bibliothèque ».
- **Contrôle qualité** : un prix de bibliothèque à vérifier, ancien, archivé ou de fiabilité faible utilisé dans
  une DPGF ou un sous-détail est signalé.
- **Exports** (Excel, CSV, PDF) : toutes les colonnes de traçabilité, dont l'assiette fiscale, le prix HT calculé,
  la fourchette, la période, la méthode, la source, la licence et l'adresse de la ressource.

## Ajouter ou régénérer une source

1. Décrire la source dans `server/services/price-sources/catalog.ts` (adresses officielles, licence, méthode,
   lecteur).
2. Écrire son lecteur à côté des existants (`matnuhpv.ts`, `ademe.ts`, `cdc.ts`, `kali.ts`, `carburants.ts`,
   `smig.ts`), avec ses tests.
3. Régénérer l'instantané : `npx tsx scripts/price-snapshot.ts <clé>`.
