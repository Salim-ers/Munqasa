/**
 * Catalogue de départ du référentiel, importé uniquement à la demande de l'administrateur.
 * Il ne contient que des références réelles et courantes en gros œuvre, identifiées par leur code
 * et leur intitulé usuel ; toutes sont importées « à vérifier » : l'édition en vigueur et l'intitulé
 * exact sont à confirmer avant toute citation dans un document diffusé.
 */
import type { ReferenceKind, ReferenceScope } from "../../shared/enums.js";

export interface CatalogReference {
  scope: ReferenceScope;
  kind: ReferenceKind;
  code: string;
  title: string;
  version: string | null;
  domain: string;
}

export const STARTER_CATALOG: CatalogReference[] = [
  // France
  { scope: "FR", kind: "dtu", code: "NF DTU 13.11", title: "Fondations superficielles", version: null, domain: "Fondations" },
  { scope: "FR", kind: "dtu", code: "NF DTU 13.3", title: "Dallages : conception, calcul et exécution", version: null, domain: "Dallages" },
  { scope: "FR", kind: "dtu", code: "NF DTU 20.1", title: "Ouvrages en maçonnerie de petits éléments : parois et murs", version: null, domain: "Maçonnerie" },
  { scope: "FR", kind: "dtu", code: "NF DTU 21", title: "Exécution des ouvrages en béton", version: null, domain: "Béton" },
  { scope: "FR", kind: "dtu", code: "NF DTU 23.1", title: "Murs en béton banché", version: null, domain: "Béton" },
  { scope: "FR", kind: "dtu", code: "NF DTU 26.1", title: "Travaux d’enduits de mortiers", version: null, domain: "Enduits" },
  { scope: "FR", kind: "norme", code: "NF EN 206/CN", title: "Béton : spécification, performance, production et conformité", version: null, domain: "Béton" },
  { scope: "FR", kind: "norme", code: "NF EN 13670/CN", title: "Exécution des structures en béton", version: null, domain: "Béton" },
  { scope: "FR", kind: "norme", code: "NF EN 10080", title: "Aciers pour l’armature du béton : aciers soudables pour béton armé, généralités", version: null, domain: "Aciers" },
  { scope: "FR", kind: "norme", code: "NF A 35-080-1", title: "Aciers pour béton armé : aciers soudables, barres et couronnes", version: null, domain: "Aciers" },
  { scope: "FR", kind: "norme", code: "NF EN 771-3", title: "Spécifications pour éléments de maçonnerie : éléments de maçonnerie en béton de granulats", version: null, domain: "Maçonnerie" },
  { scope: "FR", kind: "norme", code: "NF P 94-500", title: "Missions d’ingénierie géotechnique : classification et spécifications", version: null, domain: "Géotechnique" },
  { scope: "FR", kind: "eurocode", code: "NF EN 1990", title: "Eurocodes structuraux : bases de calcul des structures", version: null, domain: "Calcul des structures" },
  { scope: "FR", kind: "eurocode", code: "NF EN 1991-1-1", title: "Eurocode 1 : actions sur les structures, poids volumiques, poids propres, charges d’exploitation des bâtiments", version: null, domain: "Calcul des structures" },
  { scope: "FR", kind: "eurocode", code: "NF EN 1992-1-1", title: "Eurocode 2 : calcul des structures en béton, règles générales et règles pour les bâtiments", version: null, domain: "Béton" },
  { scope: "FR", kind: "eurocode", code: "NF EN 1997-1", title: "Eurocode 7 : calcul géotechnique, règles générales", version: null, domain: "Géotechnique" },
  { scope: "FR", kind: "eurocode", code: "NF EN 1998-1", title: "Eurocode 8 : calcul des structures pour leur résistance aux séismes, règles générales, actions sismiques et règles pour les bâtiments", version: null, domain: "Parasismique" },
  { scope: "FR", kind: "ccag", code: "CCAG Travaux", title: "Cahier des clauses administratives générales applicables aux marchés publics de travaux", version: "2021", domain: "Marchés publics" },
  // Maroc
  { scope: "MA", kind: "reglement", code: "RPS 2000", title: "Règlement de construction parasismique", version: "révisé en 2011", domain: "Parasismique" },
  { scope: "MA", kind: "ccag", code: "CCAG-T", title: "Cahier des clauses administratives générales applicables aux marchés de travaux", version: "décret n° 2-14-394 du 13 mai 2016", domain: "Marchés publics" },
  { scope: "MA", kind: "decret", code: "Décret n° 2-22-431", title: "Décret relatif aux marchés publics", version: "8 mars 2023", domain: "Marchés publics" },
  { scope: "MA", kind: "reglement", code: "RTCM", title: "Règlement thermique de construction au Maroc", version: "décret n° 2-13-874 du 15 octobre 2014", domain: "Thermique" },
];
