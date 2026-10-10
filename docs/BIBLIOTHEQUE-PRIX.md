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

### Bilan

| Pays | Prix publiés | Références distinctes | Nature |
| --- | --- | --- | --- |
| Maroc | 7 392 | 84 matériaux | fourniture seule, TTC |
| France | 39 | 24 types de travaux | fourniture et pose, HT |
| France | 74 | 4 ratios | ratios d'opération |

L'objectif de plusieurs centaines de références vérifiées par pays n'est atteint que pour les fournitures
marocaines. Pour les ouvrages posés, en France comme au Maroc, la couverture publique ouverte reste partielle :
elle se complète par vos bordereaux, devis et factures, importés et vérifiés.

Sources examinées puis écartées : données essentielles de la commande publique (montants globaux de marchés,
non décomposables en prix unitaires), bordereaux de prix des dossiers de consultation marocains (publiés sans
prix), estimations de façades d'un acteur privé, études et articles commerciaux sans données vérifiables.

## Fiabilité

Indépendante de l'ancienneté, signalée à part :

- **haute** : moyenne ou médiane publiée par un organisme public, ou médiane calculée sur au moins
  100 observations dont le troisième quartile reste inférieur au double du premier ;
- **moyenne** : médiane calculée sur au moins 30 observations, quartiles dans un rapport de 3 au plus ;
- **faible** : moins de 30 observations ou dispersion plus forte.

Vos prix reçoivent une fiabilité proposée selon leur provenance (devis, facture ou base sous licence : haute ;
DPGF ou bordereau historique, catalogue : moyenne ; tableau personnel, saisie : faible), que vous pouvez modifier.

## Chargement, actualisation, quarantaine et annulation

- **Premier chargement** : depuis l'instantané livré avec l'application (`server/data/prix`), lu et contrôlé à
  partir des ressources officielles ; il ne dépend pas de la disponibilité des sites des producteurs. Le
  chargement reste une décision de l'utilisateur (*Bibliothèque de prix* > *Sources publiques*).
- **Actualisation** : manuelle ou planifiée (tâche quotidienne ; chaque source déjà chargée est vérifiée selon
  son intervalle, 30 jours pour le Maroc, 90 pour la France). Les ressources sont téléchargées depuis leurs
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
  pays, puis classés par proximité : ville de l'affaire, sa région, niveau national, autres zones. Une seule
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
2. Écrire son lecteur à côté des existants (`matnuhpv.ts`, `ademe.ts`, `cdc.ts`), avec ses tests.
3. Régénérer l'instantané : `npx tsx scripts/price-snapshot.ts <clé>`.
