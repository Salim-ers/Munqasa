# Lecture des plans et métré : traçabilité

## Lecture d'une planche

Pour chaque page d'un PDF, le serveur lit d'abord la couche texte vectorielle (plans issus de la CAO) avec
pdf.js, sans passer par l'image : chaque texte avec sa position et son orientation. L'agent reçoit l'image de la
page et un extrait de ce texte (nombres écrits seuls, puis autres textes, sans doublons). Une page scannée n'a pas
de texte vectoriel : l'agent lit l'image seule et c'est indiqué partout.

Après la lecture de l'agent, le serveur contrôle chaque cote relevée :

| Contrôle | Signification |
| --- | --- |
| retrouvée dans le texte vectoriel | la valeur, sous forme canonique (2,50 = 2.5), figure parmi les nombres écrits sur la page |
| absente du texte vectoriel | la page a un texte vectoriel mais la valeur n'y figure pas : lecture à vérifier |
| page sans texte vectoriel | plan scanné ou image : contrôle impossible |
| déduite d'autres cotes par le lecteur | valeur calculée par l'agent, non contrôlable directement |
| dénombré sur la planche | nombre d'éléments compté sur le dessin, absent du texte |

L'échelle est lue dans le texte vectoriel quand la page n'en porte qu'une (« Ech : 1 : 50 », « 1/100 ») ; si la
page en porte plusieurs, celle du cartouche est retenue si elle en fait partie ; sinon aucune n'est retenue.
L'indice ou la révision du plan est relevé tel qu'écrit dans le cartouche.

Les éléments à relever et les unités usuelles dépendent du lot (règles de lot : `server/ai/lot-rules.ts`) ;
aucun seuil de déduction n'est supposé.

## Métré

Chaque entrée d'une formule cite les identifiants des cotes relevées dont elle vient, et explique le calcul quand
la valeur n'est pas la simple conversion d'une seule cote. Le serveur :

- calcule la quantité brute par la formule, puis chaque déduction explicite (vides, trémies, réservations) avec
  les mêmes variables, puis la quantité nette ; une déduction incalculable rend la mesure incalculable, et des
  déductions supérieures à la quantité brute sont refusées ;
- compare chaque valeur reprise d'une cote à cette cote convertie en mètres ; un écart sans calcul indiqué est
  signalé ;
- calcule la confiance de la mesure sans appréciation du modèle :
  - **élevée** : chaque entrée reprend une cote relevée, retrouvée dans le texte vectoriel, et sa valeur
    concorde ;
  - **moyenne** : entrées appuyées sur des cotes relevées, mais calculées à partir de plusieurs cotes, lues sur
    une page sans texte vectoriel, déduites par le lecteur ou dénombrées ;
  - **faible** : une entrée sans cote relevée, une cote absente du texte vectoriel, ou une valeur qui ne
    concorde pas avec sa cote.

Une valeur corrigée à la main devient une saisie : la confiance calculée sur les cotes ne s'applique plus et la
mesure repasse à vérifier. Une valeur absente n'est jamais comptée comme zéro.

La note de métrés (Excel, Word, PDF) reprend pour chaque mesure : planche, page et indice, formule et valeurs,
déductions, quantités brute et nette (formule Excel avec déductions soustraites), confiance et nombre de cotes
retrouvées dans le texte vectoriel. Le rapport d'analyse des plans indique pour chaque planche le texte vectoriel,
l'échelle retenue et le contrôle de chaque cote.

## Autres agents

- **CCTP** : chaque ouvrage du métré a au moins un article ; un ouvrage oublié par le plan proposé reçoit son
  article de mise en œuvre, ajouté par le serveur et signalé dans le journal du traitement. Les références citées
  sont limitées à celles retenues pour le document (présélection selon le pays de l'affaire).
- **DPGF** : au contrôle final, bilan des postes ayant au moins un prix d'ouvrage applicable dans la
  bibliothèque ; rien n'est appliqué d'office (*Prix de la bibliothèque* dans la DPGF).
