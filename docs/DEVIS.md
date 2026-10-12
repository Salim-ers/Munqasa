# Devis : création, calcul, statuts, versions et exports

Le module *Devis* (menu *Affaires* > *Devis*, ou *Créer un devis* depuis une affaire) établit des devis
commerciaux aux couleurs de Talab Solutions. Tous les montants sont calculés par le serveur ; rien n'est
inventé : un prix ou une quantité inconnus restent « à établir » ou « à préciser », jamais remplacés par un zéro.

## Création

| Point de départ | Ce qui est repris |
| --- | --- |
| Devis vierge | Entité émettrice : devise, taux de TVA par défaut, conditions de règlement, mentions légales |
| Affaire | Client, chantier, devise, entité du pays de l'affaire ; une section par lot choisi |
| DPGF | Chapitres et sous-chapitres en sections, postes avec quantité, prix unitaire et provenance, taux de TVA de la DPGF ; un poste non chiffré reste à établir |
| Métré | Un ouvrage par ligne avec la somme de ses mesures non rejetées et le nombre de mesures vérifiées ; prix à établir |
| Bibliothèque | Prix choisis, ramenés hors taxes au centime avec leur provenance ; quantités à préciser |
| IA | Voir *Générer mon devis avec l'IA* |

Un devis peut couvrir un lot ou plusieurs. Les coefficients des lignes décomposées viennent des réglages de
chiffrage. Le taux de TVA n'est jamais supposé : celui de l'entité émettrice ou de la DPGF, sinon à préciser.

## Règles de calcul

Calcul décimal exact, arrondi commercial au centime (demi supérieur), aux seuls endroits suivants :

1. **Prix unitaire HT**, arrondi au centime : direct (saisi, ou repris de la bibliothèque, de la DPGF, d'un
   sous-détail), ou **décomposé** : déboursé sec = fourniture + pose ; frais de chantier = taux × déboursé sec ;
   puis frais généraux, aléas et marge selon les bases et le mode choisis, par le même moteur que les
   sous-détails. Les coefficients ne s'appliquent qu'aux lignes décomposées : un prix direct est déjà un prix
   de vente et n'est jamais majoré une seconde fois.
2. **Montant brut** de la ligne : quantité × prix unitaire, arrondi au centime.
3. **Remise de ligne** : montant net = brut × (1 − taux), arrondi au centime.
4. **Sous-total de section** : somme des montants nets de ses lignes. Une **option** est chiffrée à part et
   n'entre dans aucun total.
5. **Remise globale** : appliquée une seule fois sur le total des lignes, arrondie au centime ; total HT =
   total des lignes − remise globale.
6. **TVA**, régime normal : base de chaque taux = montants nets de ses lignes, la remise globale y étant
   répartie au prorata (reste d'arrondi sur la plus forte base) ; TVA = base × taux, arrondie au centime ;
   total TTC = total HT + TVA.
7. **Acompte** : taux × total TTC arrondi au centime, ou montant fixe ramené au TTC s'il le dépasse.
8. Une ligne sans prix ou sans quantité n'a pas de montant : les totaux sont **partiels**, et la TVA, le TTC
   et l'acompte ne sont calculés que si tous les montants et tous les taux sont connus.

L'export Excel reproduit ces règles en formules (mêmes arrondis), modifiables.

### Régimes de TVA

| Régime | Effet | Mention imprimée |
| --- | --- | --- |
| TVA au taux de chaque ligne | taux de la ligne, sinon celui du devis | détail par taux |
| Autoliquidation, sous-traitance du bâtiment (France) | aucune TVA facturée | « Autoliquidation : TVA due par le preneur assujetti, article 283, 2 nonies, du code général des impôts. » |
| Franchise en base (France) | aucune TVA facturée | « TVA non applicable, article 293 B du code général des impôts. » |
| Exonération | aucune TVA facturée | « Exonération de TVA : » suivie du fondement légal saisi, obligatoire |

Les deux régimes propres au code général des impôts français sont refusés pour une entité marocaine.

## Contrôles et statuts

Contrôles recalculés à chaque modification :

- **bloquants** : aucune ligne, prix à établir, quantité à préciser, taux de TVA manquant, exonération sans
  fondement, régime inadapté au pays ;
- **majeurs** : client absent, durée de validité absente, acompte défini deux fois, prix incertain non
  confirmé (historique, à vérifier, fiabilité faible, salaire minimal repris comme prix), quantité du métré
  incomplètement vérifiée ;
- **mineurs** : conditions de règlement absentes.

| Statut | Passage |
| --- | --- |
| Brouillon | création, nouvelle version, réouverture |
| À vérifier | soumission (aucun point bloquant) ; toute modification d'un devis prêt à envoyer y revient |
| Prêt à envoyer | déclaration (aucun point bloquant ni majeur) |
| Envoyé | marqué envoyé par l'utilisateur : le devis est verrouillé, la version est figée (émetteur et client compris) |
| Accepté, refusé | depuis un devis envoyé |
| Expiré | automatiquement, quand la durée de validité d'un devis envoyé est dépassée (tâche quotidienne et consultation) |

L'application n'envoie aucun courriel : *Marquer comme envoyé* enregistre un envoi fait par l'utilisateur.
Chaque version envoyée reste téléchargeable (PDF, Excel, Word), même après une nouvelle version. Actions :
dupliquer (nouveau numéro, brouillon), préparer une nouvelle version, archiver, restaurer ; historique de
toutes les opérations. La transformation d'un devis accepté en suivi de projet attend le module de suivi,
qui n'existe pas encore : aucun bouton n'y prétend.

Un prix entré dans un devis y est copié avec sa provenance : une mise à jour de la bibliothèque, de la DPGF ou
d'un sous-détail ne modifie jamais un devis existant.

## Générer mon devis avec l'IA

À partir d'une description et, si une affaire est choisie, de ses articles de CCTP, postes de DPGF et ouvrages
du métré. Deux étapes, avec des garde-fous appliqués par le serveur :

1. l'agent propose les postes et la source de chaque quantité : poste de DPGF ou ouvrage du métré désignés
   par leur identifiant, ou nombre écrit dans la description et cité mot pour mot ; une quantité sans source
   vérifiable est écartée ;
2. l'agent choisit, pour chaque poste, un prix parmi les candidats de la bibliothèque (prix d'ouvrage, jamais
   historiques, jamais un salaire minimal) ; un identifiant hors des candidats est écarté ; un poste de DPGF
   chiffré garde son prix.

L'agent n'écrit ni condition, ni délai, ni mention : ce sont celles de l'entité émettrice. Les points à
confirmer qu'il signale sont inscrits dans l'historique du devis, qui reste un brouillon à vérifier.

## Contrôle avant export

Carte *Contrôle avant export* du devis : le PDF, l'Excel et le Word sont rendus comme au téléchargement et relus
(mise en page, pagination, structure), puis les quinze points du contrôle avant export sont vérifiés (voir
`docs/DOSSIER.md`) : contrôles du devis, montant de chaque ligne et totaux enregistrés comparés au moteur,
quantités reprises d'une DPGF comparées au poste source tant que le devis se modifie, lignes en double, unités,
DPGF d'origine archivée, statut incompatible avec un point bloquant. Le verdict n'est jamais favorable tant qu'un
point bloquant subsiste. Le contrôle est à refaire après chaque modification du devis.

## Exports

PDF, Excel et Word, version claire ou sombre, contrôlés comme les autres documents (mise en page du PDF,
structure du Word et de l'Excel) : couverture (client, chantier, référence de l'affaire, lots, numéro, date,
validité, statut, émetteur), émetteur et client, prestations par section avec sous-totaux, options à part,
récapitulatif (remise, TVA par taux ou mention du régime, TTC, acompte), conditions, mentions légales, bon
pour accord. Un devis non encore prêt à envoyer porte la mention « Document de travail ».
