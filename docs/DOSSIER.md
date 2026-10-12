# Dossier d'une affaire : création, génération, contrôle indépendant, contrôle avant export, niveaux de validation

## Créer une affaire

Bouton *Nouvelle affaire* (tableau de bord, liste des affaires, fiche client). Un seul parcours, en quatre temps
nommés *Affaire*, *Lots*, *Documents* et *Production* ; l'affaire existe dès le premier, chacun des suivants peut
être remis à plus tard, et fermer la fenêtre ouvre l'affaire telle qu'elle est.

- **Affaire** : intitulé, client ou maître d'ouvrage, type d'opération, pays, ville, adresse du site, date limite
  de remise, devise ; secteur, type de marché, phase, nature des travaux, estimation et description sous
  *Plus de détails*. Un client choisi donne son pays et son secteur s'ils n'ont pas été choisis à la main.
- **Commencer par les plans** : les plans PDF déposés sont lus sur le poste (texte vectoriel de la première page,
  cotes écartées) ; après accord explicite, ce texte seul est confié à l'agent d'analyse documentaire. Le
  serveur ne retient une valeur (intitulé, maître d'ouvrage, adresse et commune du site, nature des travaux) que
  si le passage cité figure mot pour mot sur un plan et la contient ; chaque champ prérempli montre ce passage,
  ce qui ne se vérifie pas est écarté et dit. Un maître d'ouvrage déjà client est reconnu (son pays est repris),
  sinon sa création est proposée. Le type d'opération découle de l'intitulé. Les plans déposés sont ensuite
  joints à l'affaire, sans nouvel envoi à faire.
- **Lots** : lots du modèle du type d'opération présélectionnés (logements, réhabilitation, VRD), aucun pour la
  nomenclature complète du bâtiment ; recherche par numéro ou intitulé.
- **Documents** : plans et pièces, vérifiés à la réception.
- **Production** : les mêmes choix que *Générer le dossier* (documents à produire, plans, lots, TVA, niveau du
  CCTP, accord d'envoi) ; la génération lancée, l'affaire s'ouvre sur son onglet *Dossier* et sa progression.

## Générer le dossier

Onglet *Dossier* de la fiche affaire, bouton *Générer le dossier*. Un seul traitement enchaîne les agents, chacun
avec ses propres étapes ; la progression affichée est celle des étapes réellement faites, et un traitement
interrompu reprend à l'étape exacte où il s'était arrêté.

On choisit les **documents à produire** et les **lots** couverts. Seuls travaillent les agents nécessaires :

| Document demandé | Agents | Ce qui est repris s'il n'est pas demandé |
| --- | --- | --- |
| Métré depuis les plans | analyse des plans cochés, classement des ouvrages par lot, métré de chaque lot | le métré existant |
| CCTP | rédaction d'un CCTP par lot, appuyée sur les ouvrages du métré | |
| DPGF | une DPGF par lot depuis son CCTP, quantités reprises du métré | le dernier CCTP du lot |
| Sous-détails de prix | décomposition des postes avec les prix de la bibliothèque | la dernière DPGF du lot |
| Prix des postes depuis la bibliothèque | recherche de prix des postes encore sans prix | la dernière DPGF du lot |
| Devis | un devis brouillon depuis les DPGF des lots, sans appel à l'IA | la dernière DPGF de chaque lot |

Un document à reprendre qui n'existe pas est dit au lancement (« Aucun CCTP pour le lot 01 Gros œuvre : ajoutez
le CCTP aux documents à produire. ») ; rien ne démarre. Le métré exige des plans cochés. L'envoi des données à
l'API OpenAI n'est demandé, et confirmé explicitement, que si un agent doit être appelé : un devis repris d'une
DPGF existante ne transmet rien. Une génération se termine toujours par le contrôle des fichiers produits et le
contrôle indépendant.

Sur plusieurs lots, les plans sont lus une seule fois avec les règles de relevé de chaque lot, puis chaque lot a
son métré, son CCTP et sa DPGF ; le devis a une section par lot. Chaque étape porte le nom de son lot.

### Identifiants partagés

Les agents travaillent sur les mêmes données, jamais sur leurs propres copies :

- le CCTP cite les ouvrages du métré par leur identifiant ; la DPGF reprend leurs quantités, ou mesure sur les
  planches lues les postes restés à métrer en créant l'ouvrage correspondant dans le métré ;
- relancer le métré conserve les ouvrages saisis ou vérifiés, avec leurs mesures : le métreur ne les propose pas
  une seconde fois, et un nouvel ouvrage prend le code libre suivant (GO-01 pris : GO-02), jamais un code déjà
  attribué ;
- les sous-détails et la recherche de prix travaillent sur les postes de la DPGF ; le devis désigne chaque poste
  et en reprend la quantité, le prix et la provenance. Une quantité modifiée ensuite dans le devis se dit saisie.

### Recherche de prix

Pour chaque poste encore sans prix : prix d'ouvrage de la bibliothèque de même unité, même devise et même pays,
jamais un prix historique ni une valeur réglementaire ; l'agent choisit parmi ces seuls candidats, ou aucun. Le
serveur applique le prix choisi avec les règles d'un choix manuel (prix TTC ramené hors taxes, provenance inscrite
avec la mention « proposé par l'agent de recherche de prix », poste à vérifier). Un poste qu'un sous-détail chiffre
déjà est laissé à ce sous-détail, qui se valide puis se reporte. Un poste sans candidat reste à chiffrer.

## Contrôle indépendant

Disponible seul (*Lancer le contrôle*) ou en fin de génération. Il n'appelle aucun modèle et ne se fie à aucune
valeur enregistrée :

- **recalculs** : quantité brute, déductions et quantité nette de chaque mesure à partir de sa formule ;
  quantité de chaque poste de DPGF reprise du métré ; prix reporté d'un sous-détail validé ; montant de chaque
  poste ; déboursés et prix de vente des sous-détails. Chaque écart est corrigé et journalisé (avant, après,
  explication) ; une DPGF validée corrigée repasse « à valider » ;
- **fichiers produits** : chaque document du dossier complet (CCTP, DPGF, BPU, DQE, estimation, sous-détails,
  note de métrés, rapport d'analyse) est rendu comme au téléchargement, le PDF relu, le Word et l'Excel contrôlés ;
  le bilan est enregistré avec l'empreinte du contenu rendu ;
- **contrôles** : contrôles qualité du CCTP, de la DPGF, des sous-détails, du métré et du dossier, anomalies de
  rendu comprises ;
- **empreinte** : le contenu contrôlé (métré, CCTP, DPGF, sous-détails, hors statuts de validation) est résumé
  par une empreinte SHA-256 ; toute modification ultérieure, ajout ou suppression compris, rend le contrôle caduc.

Ce qui ne se calcule pas (donnée absente, valeur à vérifier, article non rédigé) reste une anomalie à traiter,
jamais corrigé par supposition.

## Contrôle avant export

Carte *Contrôle avant export* de l'onglet *Dossier* (bouton *Vérifier*), index du dossier complet, et carte du même
nom sur chaque devis. Les contrôles qualité sont rejoués sur l'état actuel, puis chaque anomalie est rattachée à
l'un des quinze points :

| Point | Ce qui est vérifié |
| --- | --- |
| Cohérence des ouvrages | postes reliés à un ouvrage existant du métré, ouvrages mesurés repris dans la DPGF, ouvrages couverts par un article |
| Cohérence des lots | documents et ouvrages rattachés aux lots de l'affaire, ouvrage d'un autre lot dans une DPGF, numéros de lot uniques |
| Unités | unité de chaque poste, renseignée et reconnue, identique à celle de son ouvrage et du prix appliqué ; mesure dans une autre unité que son ouvrage |
| Quantités | quantités renseignées, positives, à jour avec le métré, mesures de confiance faible |
| Formules | formules du métré calculables, quantité enregistrée égale au calcul de sa formule |
| Prix | prix renseignés, positifs, actuels, ni archivés ni rejetés, dans la devise du document, cohérents avec les sous-détails validés |
| Pertes | pertes appliquées une seule fois, taux au-delà de 25 % à confirmer, pertes sur de la main-d'œuvre |
| Taxes | taux de TVA renseigné et courant pour le pays (France : 20, 10, 5,5, 2,1 %, taux de Corse et d'outre-mer ; Maroc : 20, 14, 10, 7 %), régime du devis cohérent |
| Totaux | montant de chaque ligne égal à la quantité multipliée par le prix, totaux du devis égaux au calcul, totaux partiels signalés |
| Doublons | codes d'ouvrage, codes de la DPGF, numéros d'article, postes, mesures et lignes de devis en double |
| Références des documents | postes reliés aux articles du CCTP, renvois vers des articles existants, mesures reliées à un plan non supprimé, mentions du devis |
| Références réglementaires | normes et textes cités présents au référentiel, ni rejetés ni à vérifier |
| Mise en page | marges, superpositions, textes complets, pages presque vides, titres isolés, couverture, structure des fichiers |
| Pagination | en-têtes, pieds de page et numérotation des pages |
| Statuts | document validé malgré une anomalie bloquante, document resté en génération, mesure vérifiée sans quantité, devis prêt à envoyer avec un point bloquant |

Chaque point est *aucune anomalie*, *réserves*, *bloquant*, *non contrôlé* ou *sans objet* : un point sans rien à
contrôler n'est jamais déclaré conforme, et la mise en page et la pagination sont « non contrôlées » tant que les
fichiers n'ont pas été rendus depuis la dernière modification. Le verdict n'est jamais favorable tant qu'une
anomalie bloquante subsiste : « 1 anomalie bloquante : aucun document ne peut être déclaré validé tant qu'elle
subsiste ». L'export reste possible (documents de travail), le statut imprimé sur chaque document en tient compte
et l'index du dossier complet reprend les quinze points. Avant chaque téléchargement d'un document, ses contrôles
sont rejoués pour que son statut imprimé soit celui de l'état actuel.

## Niveaux de validation

Recalculés à chaque ouverture sur l'état réel ; chacun suppose le précédent.

| Niveau | Conditions |
| --- | --- |
| Brouillon | CCTP ou DPGF absent, traitement en cours, ou anomalie bloquante ouverte |
| Généré avec réserves | CCTP et DPGF établis, sans anomalie bloquante ni traitement en cours |
| Vérification automatique réussie | contrôle indépendant à jour, sans anomalie majeure |
| Prêt pour revue | mesures toutes vérifiées ou rejetées, postes tous chiffrés, articles tous rédigés |
| Validé par un professionnel | CCTP et DPGF validés, déclaration signée après leur dernière validation |

La déclaration de validation professionnelle n'est acceptée qu'au niveau « Prêt pour revue », CCTP et DPGF
validés. Elle enregistre le nom et la qualité du signataire, le texte de la
déclaration et les versions des documents. Toute modification ultérieure fait redescendre le niveau : le document
modifié repasse à valider, le contrôle devient caduc, la déclaration est à renouveler.

La plateforme enregistre la déclaration ; elle ne certifie ni la qualification du signataire ni la conformité
réglementaire du dossier. Les niveaux, le contrôle avant export et le rapport de contrôle ne valent ni
certification réglementaire ni validation structurelle.
