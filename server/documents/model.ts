/**
 * Modèle documentaire unique : chaque document (CCTP, DPGF, BPU, DQE, estimation, note de métré, rapports,
 * bibliothèque de prix) est d'abord décrit ici, à partir des données de la base, puis rendu en Word et en
 * PDF par les mêmes règles. Les deux formats ont donc toujours le même contenu.
 */
import type { DocTheme } from "./brand.js";

export type DocumentKind = "cctp" | "dpgf" | "bpu" | "dqe" | "estimation" | "metre" | "analyse" | "controle" | "bibliotheque" | "sous_details";

export interface DocMeta {
  kind: DocumentKind;
  /** Type de document en toutes lettres, sur la couverture (« Cahier des clauses techniques particulières »). */
  typeLabel: string;
  /** Sigle court, repris dans l'en-tête (« CCTP »). */
  shortLabel: string;
  title: string;
  project: { reference: string; name: string; location: string | null; phase: string | null };
  client: string | null;
  lot: string | null;
  version: number | null;
  date: Date;
  /** Statut lisible (« Document de travail », « Prêt pour validation professionnelle »…). */
  status: string;
  company: string | null;
  footerText: string;
  orientation: "portrait" | "landscape";
  /** Sommaire automatique (documents longs). */
  toc: boolean;
  /** Mention de réserve imprimée sous le titre (estimation, contrôle automatique…). */
  disclaimer?: string | null;
}

/** Mise en forme d'un morceau de texte dans un paragraphe. */
export type Inline = string | { text: string; bold?: boolean; italic?: boolean; tone?: "muted" | "primary" };

export type Align = "left" | "right" | "center";

export interface Column {
  label: string;
  align?: Align;
  /** Largeur relative ; « * » partage la place restante. */
  width?: number | "*";
}

export interface Cell {
  text: string;
  align?: Align;
  bold?: boolean;
  tone?: "muted" | "primary";
  colSpan?: number;
}

export interface Row {
  cells: Array<Cell | string>;
  /** Rôle de la ligne : groupe (chapitre), sous-groupe, ligne courante, sous-total, total. */
  kind?: "group" | "subgroup" | "item" | "subtotal" | "total" | "note";
}

export type Block =
  | { type: "heading"; level: 1 | 2 | 3; number?: string | null; text: string; pageBreakBefore?: boolean; toc?: boolean }
  | { type: "paragraph"; content: Inline[]; tone?: "muted" | "small" }
  | { type: "list"; ordered: "letters" | "numbers" | "bullets"; items: Inline[][] }
  | { type: "requirement"; content: Inline[] }
  | { type: "note"; content: Inline[]; label?: string }
  | { type: "callout"; tone: "info" | "warning" | "danger" | "success"; title: string; content: Inline[] }
  | { type: "keyValues"; rows: Array<[string, string]> }
  | { type: "table"; columns: Column[]; rows: Row[]; dense?: boolean; caption?: string | null }
  | { type: "references"; codes: string[] }
  | { type: "pageBreak" };

export interface DocModel {
  meta: DocMeta;
  blocks: Block[];
}

export interface RenderOptions {
  theme: DocTheme;
}

/** Texte brut d'une suite de morceaux (index, recherche, tests). */
export function plain(content: Inline[]): string {
  return content.map((c) => (typeof c === "string" ? c : c.text)).join("");
}

export const cellOf = (c: Cell | string): Cell => (typeof c === "string" ? { text: c } : c);
