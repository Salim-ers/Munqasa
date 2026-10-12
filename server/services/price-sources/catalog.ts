/**
 * Sources publiques de la bibliothèque de prix : adresses officielles des ressources, licence, méthode
 * et lecteur de chacune. Aucune base commerciale ou payante n'est lue. Aucun prix d'un pays n'est
 * converti vers l'autre : chaque source ne produit que des prix de son propre pays.
 */
import type { Country } from "../../../shared/enums.js";
import type { SourceRecord } from "../../../shared/prices.js";
import { ADEME_TABLES, type AdemeTable, parseAdeme } from "./ademe.js";
import { parseCarburants } from "./carburants.js";
import { parseCdc } from "./cdc.js";
import { decodeText } from "./common.js";
import { type KaliIdcc, parseKali } from "./kali.js";
import { parseMatnuhpv } from "./matnuhpv.js";
import { parseSmig } from "./smig.js";

export interface ResourceSpec {
  url: string;
  title: string;
  /** Table de la source portée par la ressource (ADEME). */
  table?: AdemeTable;
  /** Rôle de la ressource dans la source : convention collective lue (« 1597 »), série du SMIC (« smic »). */
  role?: string;
}

export interface FetchedResource extends ResourceSpec {
  data: Uint8Array;
}

export interface SourceDefinition {
  key: string;
  name: string;
  publisher: string;
  country: Country;
  homepage: string;
  license: string;
  licenseUrl: string;
  description: string;
  method: string;
  coverage: string;
  /** Intervalle de vérification des mises à jour, en jours. */
  refreshDays: number;
  /** Variation au-delà de laquelle une nouvelle valeur part en quarantaine, en %. */
  maxVariation: number;
  resources: ResourceSpec[];
  parse(files: FetchedResource[]): Promise<SourceRecord[]>;
}

const ODBL = { license: "Open Data Commons Open Database License (ODbL)", licenseUrl: "https://opendatacommons.org/licenses/odbl/1-0/" };
const OFFICIAL_MA = { license: "Texte officiel, non protégé par le droit d’auteur (loi n° 2-00, article 8)", licenseUrl: "https://www.wipo.int/wipolex/fr/legislation/details/5058" };
const ETALAB = { license: "Licence Ouverte version 2.0 (Etalab)", licenseUrl: "https://www.etalab.gouv.fr/licence-ouverte-open-licence/" };

const DATA_GOV_MA = "https://data.gov.ma/data/fr/dataset";
const KALI_DATA = "https://raw.githubusercontent.com/SocialGouv/kali-data/master/data";
const SGG_BO = "https://www.sgg.gov.ma/BO/AR/3111";
const matnuhpvResource = (dataset: string, resource: string, file: string, title: string): ResourceSpec => ({
  url: `${DATA_GOV_MA}/${dataset}/resource/${resource}/download/${file}`,
  title,
});

export const SOURCES: SourceDefinition[] = [
  {
    key: "matnuhpv-materiaux",
    name: "Prix et indices des matériaux de construction",
    publisher: "Ministère de l’Aménagement du territoire national, de l’Urbanisme, de l’Habitat et de la Politique de la ville (Maroc)",
    country: "MA",
    homepage: `${DATA_GOV_MA}/caf088a1-864a-4e44-a64c-c789601901b6`,
    ...ODBL,
    description: "Prix moyens de vente TTC des matériaux de construction relevés par le ministère, par année, au niveau national, des 12 régions et de leurs agglomérations.",
    method: "Valeur de la dernière année publiée pour chaque zone et chaque variété, série annuelle complète conservée. Classeurs régionaux préférés au classeur national pour les régions, car publiés plus récemment. Prix TTC au taux normal de TVA de 20 %, ramenés HT pour les sous-détails.",
    coverage: "Fournitures de gros œuvre, menuiserie et quincaillerie, peinture, vitrerie et plâtre, plomberie et sanitaires, revêtements, électricité, étanchéité. Années 2005 à 2022 selon les zones, niveau national arrêté à 2019.",
    refreshDays: 30,
    maxVariation: 30,
    resources: [
      matnuhpvResource("caf088a1-864a-4e44-a64c-c789601901b6", "943f6680-950a-47a3-abef-5c64e6e18fec", "prix-et-indices-des-materiaux-construction-national.xlsx", "National, 2005 à 2019"),
      matnuhpvResource("0054763b-135b-4966-ae3b-58025b30ba3c", "c48ae812-544b-4cf4-aeb4-45e476ed9738", "prix-et-indices-des-materiaux-construction-region-oriental.xlsx", "Région de l’Oriental"),
      matnuhpvResource("a1e6f041-4b11-4f23-8ee4-3ca33b01ebd3", "4ee5a6b4-4319-4c57-bad9-2c5eda64f844", "prix-et-indices-des-materiaux-construction-region-casablanca-settat.xlsx", "Région Casablanca-Settat"),
      matnuhpvResource("6ea1e331-dba6-417a-b70c-2daee1baa638", "8f65cf99-a979-4133-b7a7-982579fc8355", "prix-et-indices-des-materiaux-construction-region-daraa-tafilalet.xlsx", "Région Drâa-Tafilalet"),
      matnuhpvResource("dd9f3c89-d1bf-437a-992e-f84c8c2a8d65", "33ba1736-de3a-433a-bd83-a2bad0b57d5f", "prix-et-indices-des-materiaux-construction-region-guelmim-oued-noun.xlsx", "Région Guelmim-Oued Noun"),
      matnuhpvResource("1ec3e8a8-ef8b-4f32-a0e1-fcc2a33569bc", "195fffda-33f7-4ee1-8a76-375522cfd8ec", "prix-et-indices-des-materiaux-construction-region-marrakech-safi.xlsx", "Région Marrakech-Safi"),
      matnuhpvResource("4fcdc05e-9c30-40d0-8f00-ce20d45eed31", "960a5d9a-0df7-4c47-b39a-8e74ff03a141", "prix-et-indices-des-materiaux-construction-region-rabat-sale-kenitra.xlsx", "Région Rabat-Salé-Kénitra"),
      matnuhpvResource("f8f0aef2-f271-4bd0-b1f2-c162feac367d", "b508a2ef-604f-46e8-bd4f-cf2ea8a41b1b", "prix-et-indices-des-materiaux-construction-region-souss-massa.xlsx", "Région Souss-Massa"),
      matnuhpvResource("572e743a-9d8d-43ac-b1fa-a4cb0ed90ad5", "e1bb80d0-e3a9-4b57-833c-164f9986efd0", "prix-et-indices-des-materiaux-construction-region-tanger-tetouan-al-hoceima.xlsx", "Région Tanger-Tétouan-Al Hoceïma"),
      matnuhpvResource("bfb27f76-edab-4925-ac5c-175ee15682f7", "a4e9f090-7d14-4940-9ee6-3b6aac94e499", "prix-et-indices-des-materiaux-construction-region-laayoune-sakia-el-hamra.xlsx", "Région Laâyoune-Sakia El Hamra"),
      matnuhpvResource("45eb9946-af37-4406-9534-118f7155b54c", "27ca322c-e71d-486f-aec0-e22851c959bb", "prix-et-indices-des-materiaux-construction-region-fes-meknes.xlsx", "Région Fès-Meknès"),
      matnuhpvResource("09c6a6f7-f49f-47f1-844a-1d5282119839", "25161720-ac49-4522-bcc0-8d62eb179606", "prix-et-indices-des-materiaux-construction-region-benimellal-khenifra.xlsx", "Région Béni Mellal-Khénifra"),
      matnuhpvResource("eb1b7a1b-6445-4d50-a394-e81d1fcbe5ab", "7ab3ec45-6627-4e72-8ca0-d1ac978ff112", "prix-et-indices-des-materiaux-construction-region-dakhla-oued-eddahab.xlsx", "Région Dakhla-Oued Ed-Dahab"),
    ],
    parse: (files) => parseMatnuhpv(files.map((f) => ({ url: f.url, title: f.title, data: f.data }))),
  },
  {
    key: "ademe-renovation",
    name: "Coûts des travaux de rénovation énergétique",
    publisher: "ADEME, Agence de la transition écologique (France)",
    country: "FR",
    homepage: "https://www.data.gouv.fr/datasets/couts-des-travaux-de-renovation-isolation",
    ...ETALAB,
    description: "Près de 12 000 gestes de rénovation énergétique de logements relevés sur devis et factures du réseau FAIRE entre 2001 et 2018 : isolation, menuiseries, chauffage, eau chaude sanitaire, ventilation, photovoltaïque.",
    method: "Prix unitaire de chaque geste (coût total HT divisé par la surface posée, le nombre d’ouvertures ou la puissance installée), puis médiane et quartiles par type de travaux, publiés à partir de 20 gestes. Gestes sans quantité exploitable écartés. Aucune actualisation : valeurs en euros de l’époque, datées par la date médiane des devis et factures.",
    coverage: "Rénovation énergétique en France : isolation des parois et toitures, fenêtres et portes, générateurs de chauffage, chauffe-eau, ventilation mécanique, photovoltaïque. Observations de 2001 à 2018.",
    refreshDays: 90,
    maxVariation: 30,
    resources: ADEME_TABLES.map((table) => ({ url: `https://data.ademe.fr/data-fair/api/v1/datasets/${table}/raw`, title: `Table ${table}`, table })),
    parse: async (files) => parseAdeme(files.filter((f) => f.table).map((f) => ({ url: f.url, title: f.title, table: f.table!, text: decodeText(f.data) }))),
  },
  {
    key: "cdc-logement-social",
    name: "Coûts et surfaces moyens des logements sociaux financés par la CDC",
    publisher: "Caisse des Dépôts (France)",
    country: "FR",
    homepage: "https://www.data.gouv.fr/datasets/couts-et-surfaces-moyens-des-logements-sociaux-finances-par-la-cdc-depuis-2018",
    ...ETALAB,
    description: "Prix de revient médians des opérations de logement social financées par la Caisse des Dépôts depuis 2018, construction et réhabilitation, au m² de surface utile et par logement, par région.",
    method: "Médianes publiées par la source pour la dernière année disponible de chaque région, série annuelle conservée. Une valeur nulle de la source signifie l’absence de donnée et n’est pas reprise.",
    coverage: "Ratios d’opération entière pour l’estimation globale de programmes de logements, toutes régions de France, années de financement 2018 à 2025.",
    refreshDays: 90,
    maxVariation: 30,
    resources: [
      {
        url: "https://opendata.caissedesdepots.fr/api/explore/v2.1/catalog/datasets/constructionrehabilitation_logementsocial_surface_prix/exports/csv?use_labels=true",
        title: "Export CSV",
      },
    ],
    parse: async (files) => (files[0] ? parseCdc({ url: files[0].url, title: files[0].title, text: decodeText(files[0].data) }) : []),
  },
  {
    key: "salaires-btp",
    name: "Salaires minimaux et indemnités de petits déplacements du BTP",
    publisher: "Direction de l’information légale et administrative, base KALI de Légifrance, et Insee (France)",
    country: "FR",
    homepage: "https://www.data.gouv.fr/datasets/kali-conventions-collectives-nationales",
    ...ETALAB,
    description: "Accords régionaux et départementaux en vigueur des conventions collectives du BTP : salaires minimaux des ouvriers du bâtiment, des ouvriers des travaux publics et des ETAM du bâtiment, indemnités de repas, de trajet et de transport des ouvriers par zone ; SMIC horaire comme plancher légal.",
    method: "Pour chaque convention, zone d’accord et nature, texte le plus récent déjà en vigueur, lu dans la copie JSON de la base KALI publiée par la Fabrique numérique des ministères sociaux ; barème à venir mentionné en note. Salaire ramené à l’heure sur 151,67 heures par mois ou 1 820 heures par an, porté au SMIC horaire quand il lui est inférieur. SMIC : série 000822484 de l’Insee, réutilisation libre, source citée. Tableau dont la structure n’est pas reconnue avec certitude écarté, jamais deviné.",
    coverage: "Ouvriers du bâtiment des entreprises de plus de 10 salariés, IDCC 1597 ; ouvriers des travaux publics, IDCC 1702 ; ETAM du bâtiment, IDCC 2609 ; dans toutes les régions de France métropolitaine où un accord récent est publié. Minima bruts hors charges sociales, jamais des taux de facturation.",
    refreshDays: 30,
    maxVariation: 30,
    resources: [
      { url: `${KALI_DATA}/KALICONT000005635220.json`, title: "Ouvriers du bâtiment, entreprises de plus de 10 salariés, IDCC 1597", role: "1597" },
      { url: `${KALI_DATA}/KALICONT000005635467.json`, title: "Ouvriers des travaux publics, IDCC 1702", role: "1702" },
      { url: `${KALI_DATA}/KALICONT000018773893.json`, title: "ETAM du bâtiment, IDCC 2609", role: "2609" },
      { url: "https://bdm.insee.fr/series/sdmx/data/SERIES_BDM/000822484", title: "SMIC horaire brut, série Insee 000822484", role: "smic" },
    ],
    parse: async (files) => {
      const conventions = files
        .filter((f) => f.role === "1597" || f.role === "1702" || f.role === "2609")
        .map((f) => ({ url: f.url, title: f.title, idcc: f.role as KaliIdcc, json: JSON.parse(decodeText(f.data)) as unknown }));
      const smic = files.find((f) => f.role === "smic");
      return parseKali(conventions, smic ? { url: smic.url, title: smic.title, xml: decodeText(smic.data) } : null);
    },
  },
  {
    key: "carburants-prix",
    name: "Prix des carburants à la pompe",
    publisher: "Direction générale de la concurrence, de la consommation et de la répression des fraudes (France)",
    country: "FR",
    homepage: "https://data.economie.gouv.fr/explore/dataset/prix-des-carburants-en-france-flux-instantane-v2/",
    ...ETALAB,
    description: "Prix affichés à la pompe par près de 10 000 stations de France métropolitaine, mis à jour en continu : gazole et sans-plomb 95-E10, carburants des engins et véhicules de chantier.",
    method: "Prix mis à jour dans les sept jours précédant le relevé le plus récent, hors affichages invraisemblables ; médiane et quartiles par région et pour la France métropolitaine, à partir de 20 stations. Prix TTC, TVA de 20 % ou de 13 % en Corse et accise sur les énergies comprises.",
    coverage: "Gazole et sans-plomb 95-E10, 13 régions métropolitaines et ensemble de la métropole. Intrant des sous-détails de matériel et de transport, jamais un prix d’ouvrage.",
    refreshDays: 7,
    maxVariation: 30,
    resources: [
      {
        url: "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/exports/csv?select=id,gazole_prix,gazole_maj,e10_prix,e10_maj,code_region,region&delimiter=%3B",
        title: "Flux instantané, export CSV",
      },
    ],
    parse: async (files) => (files[0] ? parseCarburants({ url: files[0].url, title: files[0].title, text: decodeText(files[0].data) }) : []),
  },
  {
    key: "smig-maroc",
    name: "Salaire minimum légal des activités non agricoles",
    publisher: "Secrétariat général du Gouvernement, Bulletin officiel (Maroc)",
    country: "MA",
    homepage: "https://www.sgg.gov.ma/arabe/BulletinOfficiel.aspx",
    ...OFFICIAL_MA,
    description: "Montant horaire du salaire minimum légal des activités non agricoles, le SMIG, fixé par décret et publié au Bulletin officiel.",
    method: "Montant et date d’effet repris de l’article du décret qui fixe le salaire minimum pour l’heure de travail dans les activités non agricoles, lu dans l’édition arabe du Bulletin officiel ; un décret par point de la série. Un nouveau décret s’ajoute en complétant les ressources de la source.",
    coverage: "SMIG horaire national. Plancher légal, hors charges sociales, congés et frais : jamais un coût de main-d’œuvre de chantier.",
    refreshDays: 90,
    maxVariation: 30,
    resources: [
      { url: `${SGG_BO}/2025/BO_7469_Ar.pdf`, title: "Décret n° 2.25.983, Bulletin officiel n° 7469 du 29 décembre 2025" },
      { url: `${SGG_BO}/2025/BO_7367_Ar.pdf`, title: "Décret n° 2.24.1122, Bulletin officiel n° 7367 du 6 janvier 2025" },
    ],
    parse: (files) => parseSmig(files.map((f) => ({ url: f.url, title: f.title, data: f.data }))),
  },
];

export function sourceDefinition(key: string): SourceDefinition | undefined {
  return SOURCES.find((s) => s.key === key);
}
