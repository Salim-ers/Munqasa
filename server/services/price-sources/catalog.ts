/**
 * Sources publiques de la bibliothèque de prix : adresses officielles des ressources, licence, méthode
 * et lecteur de chacune. Aucune base commerciale ou payante n'est lue. Aucun prix d'un pays n'est
 * converti vers l'autre : chaque source ne produit que des prix de son propre pays.
 */
import type { Country } from "../../../shared/enums.js";
import type { SourceRecord } from "../../../shared/prices.js";
import { ADEME_TABLES, type AdemeTable, parseAdeme } from "./ademe.js";
import { parseCdc } from "./cdc.js";
import { decodeText } from "./common.js";
import { parseMatnuhpv } from "./matnuhpv.js";

export interface ResourceSpec {
  url: string;
  title: string;
  /** Table de la source portée par la ressource (ADEME). */
  table?: AdemeTable;
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
const ETALAB = { license: "Licence Ouverte version 2.0 (Etalab)", licenseUrl: "https://www.etalab.gouv.fr/licence-ouverte-open-licence/" };

const DATA_GOV_MA = "https://data.gov.ma/data/fr/dataset";
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
];

export function sourceDefinition(key: string): SourceDefinition | undefined {
  return SOURCES.find((s) => s.key === key);
}
