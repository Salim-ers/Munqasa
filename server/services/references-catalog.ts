/**
 * Catalogue de départ du référentiel, importé à la demande de l'administrateur. Chaque référence a été
 * vérifiée sur sa source officielle (boutique AFNOR, Légifrance, IMANOR, Trésorerie générale du Royaume,
 * ministère chargé de l'habitat, Bulletin officiel) : code, intitulé, édition et statut « en vigueur ».
 * Elle arrive « vérifiée », avec sa source et la date de cette vérification ; seuls l'identifiant,
 * l'intitulé et la source sont conservés, jamais le contenu d'une norme payante.
 *
 * L'import n'écrase jamais une saisie : il ajoute les références absentes et ne met à jour que celles
 * importées par l'ancien catalogue (« à vérifier ») et restées telles quelles.
 */
import { eq } from "drizzle-orm";
import type { ReferenceKind, ReferenceScope } from "../../shared/enums.js";
import { type Database, schema } from "../db/index.js";

/** Date à laquelle chaque référence du catalogue a été vérifiée sur sa source. */
export const CATALOG_VERIFIED_ON = "2026-10-14";
const VERIFIED_LABEL = "14 octobre 2026";

export interface CatalogReference {
  scope: ReferenceScope;
  kind: ReferenceKind;
  code: string;
  title: string;
  version: string | null;
  publishedOn: string | null;
  domain: string;
  sourceUrl: string;
  /** Où et comment la référence a été vérifiée, repris dans ses notes. */
  checked: string;
  /** Codes sous lesquels l'ancien catalogue l'avait importée. */
  formerly?: string[];
}

const afnor = (id: string) => `https://www.boutique.afnor.org/fr-fr/norme/x/x/${id}`;
const legifrance = (id: string) => `https://www.legifrance.gouv.fr/jorf/id/${id}`;
const IMANOR = "https://www.imanor.gov.ma/wp-content/uploads";
const RCNM014 = `${IMANOR}/2016/08/RCNM014-R%C3%A8gles-NM-Ciments-v03.pdf`;
const RCNM019 = `${IMANOR}/2022/08/RCNM019-Regles-NM-BPE-V03.pdf`;
const RCNM004 = `${IMANOR}/2016/08/RCNM004-R%C3%A8gles-NM-Fers-%C3%A0-b%C3%A9ton-v05.pdf`;
const onAfnor = (published: string) => `sur la boutique AFNOR : norme en vigueur, publiée en ${published}`;
const inRcnm = (rules: string) => `dans ${rules} publiées par l’IMANOR, qui la citent parmi les normes de référence de la marque NM`;
const RULES_CIMENT = "les règles de certification NM Ciments (RCNM014, version 03 du 31 juillet 2020)";
const RULES_BETON = "les règles de certification NM Béton prêt à l’emploi (RCNM019, version 03 du 7 décembre 2021)";
const RULES_FERS = "les règles de certification NM Fers à béton (RCNM004, version 05 du 30 mars 2021)";

export const STARTER_CATALOG: CatalogReference[] = [
  // France : DTU
  { scope: "FR", kind: "dtu", code: "NF DTU 13.1", title: "Travaux de bâtiment - Fondations superficielles", version: "septembre 2019", publishedOn: null, domain: "Fondations", sourceUrl: afnor("fa198837/83983"), checked: onAfnor("septembre 2019") },
  { scope: "FR", kind: "dtu", code: "NF DTU 13.3", title: "Travaux de dallages - Conception, calcul et exécution", version: "décembre 2021", publishedOn: null, domain: "Dallages", sourceUrl: afnor("fa204046/303472"), checked: onAfnor("décembre 2021") },
  { scope: "FR", kind: "dtu", code: "NF DTU 20.1", title: "Travaux de bâtiment - Ouvrages en maçonnerie de petits éléments - Parois et murs", version: "juillet 2020", publishedOn: null, domain: "Maçonnerie", sourceUrl: afnor("fa200726/85614"), checked: onAfnor("juillet 2020") },
  { scope: "FR", kind: "dtu", code: "NF DTU 21", title: "Travaux de bâtiment - Exécution des ouvrages en béton", version: "juin 2017", publishedOn: null, domain: "Béton", sourceUrl: afnor("fa191614/1668"), checked: onAfnor("juin 2017") },
  { scope: "FR", kind: "dtu", code: "NF DTU 23.1", title: "Travaux de bâtiment - Murs en béton banché - Cahier des clauses techniques", version: "mai 1993", publishedOn: null, domain: "Béton", sourceUrl: afnor("fa029709/290"), checked: onAfnor("mai 1993") },
  { scope: "FR", kind: "dtu", code: "NF DTU 25.41 P1-1", title: "Travaux de bâtiment - Ouvrages en plaques de plâtre - Plaques à faces cartonnées - Partie 1-1 : cahier des clauses techniques types", version: "février 2022", publishedOn: null, domain: "Cloisons et doublages", sourceUrl: afnor("fa194671/321485"), checked: onAfnor("février 2022") },
  { scope: "FR", kind: "dtu", code: "NF DTU 26.1", title: "Travaux de bâtiment - Travaux d’enduits de mortiers", version: "janvier 2008", publishedOn: null, domain: "Enduits", sourceUrl: afnor("fa104012/918"), checked: onAfnor("janvier 2008") },
  { scope: "FR", kind: "dtu", code: "NF DTU 36.5", title: "Travaux de bâtiment - Mise en œuvre des fenêtres et portes extérieures", version: "octobre 2010", publishedOn: null, domain: "Menuiseries extérieures", sourceUrl: afnor("fa167820/35265"), checked: onAfnor("octobre 2010") },
  { scope: "FR", kind: "dtu", code: "NF DTU 52.2", title: "Travaux de bâtiment - Pose collée des revêtements céramiques et assimilés - Pierres naturelles", version: "juin 2022", publishedOn: null, domain: "Carrelage et faïence", sourceUrl: afnor("fa205480/327544"), checked: onAfnor("juin 2022") },
  { scope: "FR", kind: "dtu", code: "NF DTU 59.1", title: "Travaux de bâtiment - Revêtements de peinture en feuil mince, semi-épais ou épais", version: "juin 2013", publishedOn: null, domain: "Peinture", sourceUrl: afnor("fa183018/1371"), checked: onAfnor("juin 2013") },
  { scope: "FR", kind: "dtu", code: "NF DTU 60.1 P1-1-1", title: "Travaux de bâtiment - Plomberie sanitaire pour bâtiments - Partie 1-1-1 : réseaux d’alimentation d’eau froide et chaude sanitaire - Cahier des clauses techniques types", version: "décembre 2012", publishedOn: null, domain: "Plomberie", sourceUrl: afnor("fa166106/322995"), checked: onAfnor("décembre 2012") },
  // France : normes
  { scope: "FR", kind: "norme", code: "NF EN 206+A2/CN", title: "Béton - Spécification, performance, production et conformité - Complément national à la norme NF EN 206+A2", version: "décembre 2025", publishedOn: null, domain: "Béton", sourceUrl: afnor("fa211302/456716"), checked: onAfnor("décembre 2025"), formerly: ["NF EN 206/CN"] },
  { scope: "FR", kind: "norme", code: "NF EN 13670", title: "Exécution des structures en béton", version: "décembre 2009", publishedOn: null, domain: "Béton", sourceUrl: afnor("fa163129/40710"), checked: onAfnor("décembre 2009") },
  { scope: "FR", kind: "norme", code: "NF EN 13670/CN", title: "Exécution des structures en béton - Complément national à la NF EN 13670:2013", version: "février 2013", publishedOn: null, domain: "Béton", sourceUrl: afnor("fa167342/40709"), checked: onAfnor("février 2013") },
  { scope: "FR", kind: "norme", code: "NF EN 197-1", title: "Ciment - Partie 1 : composition, spécifications et critères de conformité des ciments courants", version: "septembre 2011", publishedOn: null, domain: "Liants", sourceUrl: afnor("fa149898/1234"), checked: onAfnor("septembre 2011") },
  { scope: "FR", kind: "norme", code: "NF A35-080-1", title: "Aciers pour béton armé - Aciers soudables - Partie 1 : barres et couronnes", version: "mai 2020", publishedOn: null, domain: "Aciers", sourceUrl: afnor("fa193699/84994"), checked: onAfnor("mai 2020"), formerly: ["NF A 35-080-1"] },
  { scope: "FR", kind: "norme", code: "NF EN 771-3+A1", title: "Spécifications pour éléments de maçonnerie - Partie 3 : éléments de maçonnerie en béton de granulats (granulats courants et légers)", version: "août 2015", publishedOn: null, domain: "Maçonnerie", sourceUrl: afnor("fa060271/45959"), checked: onAfnor("août 2015"), formerly: ["NF EN 771-3"] },
  { scope: "FR", kind: "norme", code: "NF EN 771-3+A1/CN", title: "Spécifications pour éléments de maçonnerie - Partie 3 : éléments de maçonnerie en béton de granulats (granulats courants et légers) - Complément national à la NF EN 771-3+A1:2015", version: "décembre 2017", publishedOn: null, domain: "Maçonnerie", sourceUrl: afnor("fa191015/79843"), checked: onAfnor("décembre 2017") },
  { scope: "FR", kind: "norme", code: "NF P94-500", title: "Missions d’ingénierie géotechnique - Classification et spécifications", version: "novembre 2013", publishedOn: null, domain: "Géotechnique", sourceUrl: afnor("fa177810/1408"), checked: onAfnor("novembre 2013"), formerly: ["NF P 94-500"] },
  { scope: "FR", kind: "norme", code: "NF C15-100-1", title: "Installations électriques à basse tension - Partie 1 : exigences générales", version: "août 2024", publishedOn: null, domain: "Électricité", sourceUrl: afnor("fa186953/423384"), checked: onAfnor("août 2024") },
  // France : Eurocodes
  { scope: "FR", kind: "eurocode", code: "NF EN 1990", title: "Eurocodes structuraux - Bases de calcul des structures", version: "avril 2002", publishedOn: null, domain: "Calcul des structures", sourceUrl: afnor("fa102408/21211"), checked: onAfnor("avril 2002") },
  { scope: "FR", kind: "eurocode", code: "NF EN 1991-1-1", title: "Eurocode 1 - Actions sur les structures - Partie 1-1 : actions générales - Poids volumiques, poids propres, charges d’exploitation des bâtiments", version: "mars 2003", publishedOn: null, domain: "Calcul des structures", sourceUrl: afnor("fa102763/552"), checked: onAfnor("mars 2003") },
  { scope: "FR", kind: "eurocode", code: "NF EN 1992-1-1", title: "Eurocode 2 - Calcul des structures en béton - Partie 1-1 : règles générales et règles pour les bâtiments", version: "octobre 2005", publishedOn: null, domain: "Béton", sourceUrl: afnor("fa039724/25784"), checked: onAfnor("octobre 2005") },
  { scope: "FR", kind: "eurocode", code: "NF EN 1997-1", title: "Eurocode 7 : calcul géotechnique - Partie 1 : règles générales", version: "juin 2005", publishedOn: null, domain: "Géotechnique", sourceUrl: afnor("fa045423/25400"), checked: onAfnor("juin 2005") },
  { scope: "FR", kind: "eurocode", code: "NF EN 1998-1", title: "Eurocode 8 - Calcul des structures pour leur résistance aux séismes - Partie 1 : règles générales, actions sismiques et règles pour les bâtiments", version: "décembre 2004", publishedOn: null, domain: "Parasismique", sourceUrl: afnor("fa103832/25574"), checked: onAfnor("décembre 2004") },
  // France : textes réglementaires
  { scope: "FR", kind: "ccag", code: "CCAG Travaux", title: "Cahier des clauses administratives générales des marchés publics de travaux", version: "approuvé par l’arrêté du 30 mars 2021", publishedOn: null, domain: "Marchés publics", sourceUrl: legifrance("JORFTEXT000043310421"), checked: "sur Légifrance : arrêté du 30 mars 2021 portant approbation du cahier des clauses administratives générales des marchés publics de travaux, en vigueur" },
  { scope: "FR", kind: "decret", code: "Décret n° 2010-1254", title: "Décret n° 2010-1254 du 22 octobre 2010 relatif à la prévention du risque sismique", version: "22 octobre 2010", publishedOn: null, domain: "Parasismique", sourceUrl: legifrance("JORFTEXT000022941706"), checked: "sur Légifrance : texte en vigueur" },
  { scope: "FR", kind: "arrete", code: "Arrêté du 22 octobre 2010", title: "Arrêté du 22 octobre 2010 relatif à la classification et aux règles de construction parasismique applicables aux bâtiments de la classe dite « à risque normal »", version: "22 octobre 2010, version consolidée", publishedOn: null, domain: "Parasismique", sourceUrl: legifrance("JORFTEXT000022941755"), checked: "sur Légifrance : texte en vigueur, à lire dans sa version consolidée" },
  { scope: "FR", kind: "decret", code: "Décret n° 2021-1004", title: "Décret n° 2021-1004 du 29 juillet 2021 relatif aux exigences de performance énergétique et environnementale des constructions de bâtiments en France métropolitaine", version: "29 juillet 2021", publishedOn: null, domain: "Thermique et environnement", sourceUrl: legifrance("JORFTEXT000043877196"), checked: "sur Légifrance : texte en vigueur" },
  // Maroc : normes marocaines
  { scope: "MA", kind: "norme", code: "NM 10.1.004", title: "Liants hydrauliques - Ciments et constituants des ciments - Composition, spécifications et critères de conformité - Évaluation de la conformité - Contrôle de la qualité à la livraison", version: "2019", publishedOn: null, domain: "Liants", sourceUrl: RCNM014, checked: inRcnm(RULES_CIMENT) },
  { scope: "MA", kind: "norme", code: "NM 10.1.156", title: "Liants hydrauliques - Ciments pour travaux en eaux à haute teneur en sulfates", version: "2007", publishedOn: null, domain: "Liants", sourceUrl: RCNM014, checked: inRcnm(RULES_CIMENT) },
  { scope: "MA", kind: "norme", code: "NM 10.1.157", title: "Liants hydrauliques - Ciments pour travaux à la mer", version: "2007", publishedOn: null, domain: "Liants", sourceUrl: RCNM014, checked: inRcnm(RULES_CIMENT) },
  { scope: "MA", kind: "norme", code: "NM 10.1.005", title: "Liants hydrauliques - Techniques des essais", version: "2008", publishedOn: null, domain: "Liants", sourceUrl: RCNM014, checked: inRcnm(RULES_CIMENT) },
  { scope: "MA", kind: "norme", code: "NM 10.1.008", title: "Bétons - Spécifications, performances, production et conformité", version: null, publishedOn: null, domain: "Béton", sourceUrl: RCNM019, checked: `${inRcnm(RULES_BETON)} ; l’édition en vigueur n’y est pas précisée` },
  { scope: "MA", kind: "norme", code: "NM 10.1.353", title: "Eau de gâchage pour bétons - Spécifications d’échantillonnage, d’essais et d’évaluation de l’aptitude à l’emploi, y compris les eaux de lavage des installations de recyclage de l’industrie du béton, telle que l’eau de gâchage pour béton", version: null, publishedOn: null, domain: "Béton", sourceUrl: RCNM019, checked: `${inRcnm(RULES_BETON)} ; l’édition en vigueur n’y est pas précisée` },
  { scope: "MA", kind: "norme", code: "NM 01.4.095", title: "Produits sidérurgiques - Ronds lisses pour béton armé", version: null, publishedOn: null, domain: "Aciers", sourceUrl: RCNM004, checked: `${inRcnm(RULES_FERS)} ; l’édition en vigueur n’y est pas précisée` },
  { scope: "MA", kind: "norme", code: "NM 01.4.096", title: "Produits sidérurgiques - Armatures pour béton armé : barres et couronnes à haute adhérence - Non soudables", version: null, publishedOn: null, domain: "Aciers", sourceUrl: RCNM004, checked: `${inRcnm(RULES_FERS)} ; l’édition en vigueur n’y est pas précisée` },
  { scope: "MA", kind: "norme", code: "NM 01.4.097", title: "Produits sidérurgiques - Armatures pour béton armé : barres et couronnes à haute adhérence - Soudables", version: null, publishedOn: null, domain: "Aciers", sourceUrl: RCNM004, checked: `${inRcnm(RULES_FERS)} ; l’édition en vigueur n’y est pas précisée` },
  // Maroc : textes réglementaires
  {
    scope: "MA",
    kind: "reglement",
    code: "RPS 2000",
    title: "Règlement de construction parasismique",
    version: "version 2011, approuvée par le décret n° 2-12-682 du 28 mai 2013",
    publishedOn: null,
    domain: "Parasismique",
    sourceUrl: "https://www.matnuhpv.gov.ma/fr/5127-2/",
    checked: "sur le site du ministère de l’Aménagement du territoire national, de l’Urbanisme, de l’Habitat et de la Politique de la ville : décret n° 2-12-682 du 17 rejeb 1434 (28 mai 2013) modifiant le décret n° 2-02-177 du 9 hija 1422 (22 février 2002) approuvant le règlement",
  },
  {
    scope: "MA",
    kind: "ccag",
    code: "CCAG-T",
    title: "Cahier des clauses administratives générales applicables aux marchés de travaux",
    version: "décret n° 2-14-394 du 6 chaabane 1437 (13 mai 2016)",
    publishedOn: "2016-06-02",
    domain: "Marchés publics",
    sourceUrl: "https://www.tgr.gov.ma/wps/wcm/connect/48e2b53e-6fa9-4ee9-a6ae-bbde89b37b6f/2-14-394ccag.pdf?MOD=AJPERES&CACHEID=48e2b53e-6fa9-4ee9-a6ae-bbde89b37b6f",
    checked: "sur le texte publié par la Trésorerie générale du Royaume : Bulletin officiel n° 6470 du 2 juin 2016",
  },
  {
    scope: "MA",
    kind: "decret",
    code: "Décret n° 2-22-431",
    title: "Décret n° 2-22-431 du 15 chaabane 1444 (8 mars 2023) relatif aux marchés publics",
    version: "8 mars 2023",
    publishedOn: null,
    domain: "Marchés publics",
    sourceUrl: "https://www.tgr.gov.ma/wps/wcm/connect/200e0d2c-6df3-478d-bb8c-8cdb2a552ddd/ARRETE+decret+2-22-431+FR.pdf?MOD=AJPERES",
    checked: "sur le texte publié par la Trésorerie générale du Royaume",
  },
  {
    scope: "MA",
    kind: "reglement",
    code: "RTCM",
    title: "Règlement général de construction fixant les règles de performance énergétique des constructions (règlement thermique de construction au Maroc)",
    version: "décret n° 2-13-874 du 20 hija 1435 (15 octobre 2014)",
    publishedOn: "2014-11-06",
    domain: "Thermique",
    sourceUrl: "https://energetique.uae.ma/textes_energ/decret_%202_13_874%20_construction.pdf",
    checked: "sur le texte du Bulletin officiel n° 6306 du 12 moharrem 1436 (6 novembre 2014) mis en ligne par l’université Abdelmalek Essaâdi",
  },
];

/** Références de l'ancien catalogue retirées faute d'être en vigueur, avec le motif constaté. */
export const WITHDRAWN: Array<{ scope: ReferenceScope; code: string; reason: string }> = [
  { scope: "FR", code: "NF DTU 13.11", reason: "DTU 13.11 annulé, remplacé par le NF DTU 13.1 de septembre 2019 (boutique AFNOR)" },
];

/** Note qu'apposait l'ancien catalogue : une référence qui la porte encore n'a pas été retouchée. */
export const LEGACY_NOTE = "Catalogue de départ : édition en vigueur et intitulé exact à confirmer avant citation.";

export function catalogNote(item: CatalogReference): string {
  return `Vérifié le ${VERIFIED_LABEL} ${item.checked}. À revoir si une nouvelle édition paraît.`;
}

const key = (scope: string, code: string) => `${scope}:${code.replace(/\s+/g, "").toUpperCase()}`;

export interface CatalogImport {
  imported: number;
  updated: number;
  withdrawn: number;
  skipped: number;
}

/**
 * Ajoute les références absentes, met à jour celles de l'ancien catalogue restées « à vérifier » et
 * inchangées, rejette celles qui ne sont plus en vigueur. Une référence saisie, modifiée ou déjà
 * vérifiée par l'utilisateur n'est jamais touchée.
 */
export async function importReferenceCatalog(db: Database): Promise<CatalogImport> {
  const r = schema.technicalReference;
  const existing = await db.select({ id: r.id, scope: r.scope, code: r.code, status: r.verificationStatus, notes: r.notes }).from(r);
  const byKey = new Map(existing.map((e) => [key(e.scope, e.code), e]));
  const untouched = (e: (typeof existing)[number] | undefined) => e && e.status === "a_verifier" && e.notes === LEGACY_NOTE;
  const verifiedAt = new Date(`${CATALOG_VERIFIED_ON}T12:00:00Z`);
  const result: CatalogImport = { imported: 0, updated: 0, withdrawn: 0, skipped: 0 };
  await db.transaction(async (tx) => {
    for (const item of STARTER_CATALOG) {
      const { checked: _checked, formerly, ...values } = item;
      const row = { ...values, verificationStatus: "verifie" as const, verifiedAt, notes: catalogNote(item) };
      const current = byKey.get(key(item.scope, item.code));
      // Sous son ancien code, seulement si le nouveau n'existe pas déjà : jamais deux fois la même référence.
      const legacy = current ? (untouched(current) ? current : undefined) : (formerly ?? []).map((code) => byKey.get(key(item.scope, code))).find(untouched);
      if (legacy) {
        await tx.update(r).set(row).where(eq(r.id, legacy.id));
        result.updated++;
      } else if (current) {
        result.skipped++;
      } else {
        await tx.insert(r).values(row);
        result.imported++;
      }
    }
    for (const item of WITHDRAWN) {
      const current = byKey.get(key(item.scope, item.code));
      if (!untouched(current)) continue;
      await tx
        .update(r)
        .set({ verificationStatus: "rejete", verifiedAt: null, notes: `Retiré le ${VERIFIED_LABEL} : ${item.reason}.` })
        .where(eq(r.id, current!.id));
      result.withdrawn++;
    }
  });
  return result;
}
