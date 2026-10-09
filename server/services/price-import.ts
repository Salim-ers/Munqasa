/**
 * Lecture des fichiers de prix (Excel .xlsx ou CSV) pour l'import dans la bibliothèque :
 * CSV à la française (point-virgule, virgule décimale, encodage Windows) comme à l'anglaise,
 * nombres « 1 250,50 € » et dates « 31/12/2025 » reconnus. Rien n'est deviné : une ligne
 * illisible est refusée avec son motif.
 */
import ExcelJS from "exceljs";
import type { PriceKind } from "../../shared/enums.js";

export const MAX_ROWS = 5000;

export interface ParsedTable {
  sheets: string[];
  sheet: string | null;
  rows: string[][];
}

function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    // Export Excel en CSV sous Windows : encodage Windows-1252.
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** CSV avec guillemets, séparateur détecté (point-virgule, virgule ou tabulation). */
export function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const counts = { ";": firstLine.split(";").length, ",": firstLine.split(",").length, "\t": firstLine.split("\t").length };
  const sep = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ";") as ";" | "," | "\t";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === sep) {
      row.push(field.trim());
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field.trim());
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
      field = "";
      if (rows.length >= MAX_ROWS) break;
    } else field += ch;
  }
  row.push(field.trim());
  if (row.some((c) => c !== "") && rows.length < MAX_ROWS) rows.push(row);
  return rows;
}

export async function parsePriceFile(fileName: string, base64: string, sheet?: string | null): Promise<ParsedTable> {
  const bytes = Buffer.from(base64, "base64");
  if (/\.xlsx$/i.test(fileName)) {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(bytes as unknown as ArrayBuffer);
    } catch {
      throw new Error("Fichier Excel illisible : enregistrez-le de nouveau au format .xlsx.");
    }
    const sheets = workbook.worksheets.map((w) => w.name);
    const worksheet = (sheet && workbook.getWorksheet(sheet)) || workbook.worksheets[0];
    if (!worksheet) return { sheets, sheet: null, rows: [] };
    const rows: string[][] = [];
    worksheet.eachRow({ includeEmpty: false }, (r) => {
      if (rows.length >= MAX_ROWS) return;
      const values: string[] = [];
      for (let c = 1; c <= Math.min(r.cellCount, 200); c++) {
        const cell = r.getCell(c);
        // Une date Excel est lue telle quelle (AAAA-MM-JJ), pas dans sa forme textuelle anglaise.
        values.push(cell.value instanceof Date ? cell.value.toISOString().slice(0, 10) : (cell.text ?? "").trim());
      }
      if (values.some((v) => v !== "")) rows.push(values);
    });
    return { sheets, sheet: worksheet.name, rows };
  }
  return { sheets: [], sheet: null, rows: parseCsv(decodeText(bytes)) };
}

/** Nombre saisi à la française ou à l'anglaise (« 1 250,50 € », « 1,250.50 »), ou null. */
export function parseAmount(raw: string | undefined): string | null {
  if (!raw) return null;
  let v = raw.replace(/[\s  ]/g, "").replace(/[^\d,.-]/g, "");
  if (!v) return null;
  if (v.includes(",") && v.includes(".")) {
    // Le dernier séparateur est le séparateur décimal.
    v = v.lastIndexOf(",") > v.lastIndexOf(".") ? v.replace(/\./g, "").replace(",", ".") : v.replace(/,/g, "");
  } else v = v.replace(",", ".");
  if (!/^-?\d{1,12}(\.\d+)?$/.test(v)) return null;
  const [int, dec = ""] = v.split(".");
  return dec.length > 4 ? `${int}.${dec.slice(0, 4)}` : v;
}

/** Date « 31/12/2025 », « 31-12-2025 » ou « 2025-12-31 », ou null (y compris pour une date impossible). */
export function parseDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const v = raw.trim();
  let iso: string | null = null;
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (m) iso = `${m[1]}-${m[2]}-${m[3]}`;
  else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v))) iso = `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  if (!iso) return null;
  const date = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
}

const KIND_WORDS: Array<[RegExp, PriceKind]> = [
  [/^main_?d?_?oeuvre|^mo$/, "main_oeuvre"],
  [/^materiaux?$|^materiau/, "materiau"],
  [/^materiels?$|^engins?$/, "materiel"],
  [/^sous_?traitance/, "sous_traitance"],
  [/^transports?$/, "transport"],
  [/^ouvrages?$/, "ouvrage"],
];

/** Nature d'un prix écrite dans le fichier (« Main-d’œuvre », « Matériaux », « materiel »…), ou null. */
export function parseKind(raw: string | undefined): PriceKind | null {
  if (!raw) return null;
  const v = raw
    .toLowerCase()
    .replace(/œ/g, "oe")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return KIND_WORDS.find(([pattern]) => pattern.test(v))?.[1] ?? null;
}
