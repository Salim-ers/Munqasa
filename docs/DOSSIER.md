# Dossier d'une affaire : génération, contrôle indépendant, niveaux de validation

## Générer le dossier

Onglet *Dossier* de la fiche affaire, bouton *Générer le dossier*. Un seul traitement enchaîne les agents, chacun
avec ses propres étapes ; la progression affichée est celle des étapes réellement faites, et un traitement
interrompu reprend à l'étape exacte où il s'était arrêté.

1. Lecture des plans et métré, pour les plans cochés (sans plan coché, le métré existant est conservé).
2. Rédaction du CCTP, appuyée sur le métré s'il existe ; références citables : celles du référentiel pour le pays
   de l'affaire et l'international, hors références rejetées.
3. DPGF depuis ce CCTP, au taux de TVA saisi (jamais supposé), avec le bilan des prix d'ouvrage disponibles dans
   la bibliothèque (rien n'est appliqué d'office).
4. Sous-détails de prix, si demandés et si la bibliothèque contient des prix utilisables pour le pays et la
   devise ; sinon l'étape est écartée et son motif est inscrit.
5. Contrôle indépendant, puis niveau de validation.

L'envoi des plans et des informations de l'affaire à l'API OpenAI est confirmé explicitement à chaque lancement.

## Contrôle indépendant

Disponible seul (*Lancer le contrôle*) ou en fin de génération. Il n'appelle aucun modèle et ne se fie à aucune
valeur enregistrée :

- **recalculs** : quantité brute, déductions et quantité nette de chaque mesure à partir de sa formule ;
  quantité de chaque poste de DPGF reprise du métré ; prix reporté d'un sous-détail validé ; montant de chaque
  poste ; déboursés et prix de vente des sous-détails. Chaque écart est corrigé et journalisé (avant, après,
  explication) ; une DPGF validée corrigée repasse « à valider » ;
- **contrôles** : contrôles qualité du CCTP, de la DPGF, des sous-détails, du métré (mesures incalculables, de
  confiance faible à vérifier, ouvrages sans mesure) et du dossier (CCTP ou DPGF absents) ;
- **empreinte** : le contenu contrôlé (métré, CCTP, DPGF, sous-détails, hors statuts de validation) est résumé
  par une empreinte SHA-256 ; toute modification ultérieure, ajout ou suppression compris, rend le contrôle caduc.

Ce qui ne se calcule pas (donnée absente, valeur à vérifier, article non rédigé) reste une anomalie à traiter,
jamais corrigé par supposition.

## Niveaux de validation

Recalculés à chaque ouverture sur l'état réel ; chacun suppose le précédent.

| Niveau | Conditions |
| --- | --- |
| Brouillon | CCTP ou DPGF absent, traitement en cours, ou anomalie bloquante ouverte |
| Terminé avec réserves | CCTP et DPGF établis, sans anomalie bloquante ni traitement en cours |
| Vérification automatique réussie | contrôle indépendant à jour, sans anomalie majeure |
| Prêt pour validation professionnelle | mesures toutes vérifiées ou rejetées, postes tous chiffrés, articles tous rédigés |
| Validé par un professionnel habilité | CCTP et DPGF validés, déclaration signée après leur dernière validation |

La déclaration de validation professionnelle n'est acceptée qu'au niveau « prêt pour validation
professionnelle », CCTP et DPGF validés. Elle enregistre le nom et la qualité du signataire, le texte de la
déclaration et les versions des documents. Toute modification ultérieure fait redescendre le niveau : le document
modifié repasse à valider, le contrôle devient caduc, la déclaration est à renouveler.

La plateforme enregistre la déclaration ; elle ne certifie ni la qualification du signataire ni la conformité
réglementaire du dossier. Les niveaux et le rapport de contrôle ne valent ni certification réglementaire ni
validation structurelle.
