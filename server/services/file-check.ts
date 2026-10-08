/**
 * Vérification du type réel d'un fichier à partir de ses premiers octets (signature binaire),
 * jamais du seul nom ni du type annoncé par le navigateur. Formats acceptés : ceux des dossiers
 * de consultation et des plans (PDF, images, DXF, DWG, IFC, ZIP, Office, CSV, texte).
 */
import { fileTypeFromBuffer } from "file-type";
import { ALLOWED_EXTENSIONS } from "../../shared/schemas.js";

/** Octets lus pour identifier le format. */
export const SIGNATURE_BYTES = 4100;

export type CheckResult = { ok: true; mime: string; ext: string; note?: string } | { ok: false; reason: string };

export function extensionOf(fileName: string): string {
  const match = /\.([a-z0-9]{1,8})$/i.exec(fileName.trim());
  return match ? match[1]!.toLowerCase() : "";
}

export function isAllowedExtension(fileName: string): boolean {
  return (ALLOWED_EXTENSIONS as readonly string[]).includes(extensionOf(fileName));
}

const ascii = (bytes: Uint8Array, length = 64) => Buffer.from(bytes.subarray(0, length)).toString("latin1");

/** Texte sans octet nul (CSV, TXT, DXF ASCII, IFC). */
function looksLikeText(bytes: Uint8Array): boolean {
  return bytes.length > 0 && !bytes.includes(0);
}

/** Correspondance attendue entre l'extension et le type détecté. */
const EXPECTED: Record<string, string[]> = {
  pdf: ["application/pdf"],
  png: ["image/png"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  tif: ["image/tiff"],
  tiff: ["image/tiff"],
  webp: ["image/webp"],
  zip: ["application/zip"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/zip"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/zip"],
  xls: ["application/x-cfb", "application/vnd.ms-excel"],
};

export async function checkFileSignature(fileName: string, start: Uint8Array): Promise<CheckResult> {
  const ext = extensionOf(fileName);
  if (!isAllowedExtension(fileName)) return { ok: false, reason: `Format non accepté (.${ext || "sans extension"}).` };
  if (start.length === 0) return { ok: false, reason: "Fichier vide." };

  const head = ascii(start);
  // Formats CAO / BIM et texte : signatures propres.
  if (ext === "dwg") {
    return /^AC1\d{3}/.test(head) ? { ok: true, mime: "image/vnd.dwg", ext } : { ok: false, reason: "Ce fichier n’est pas un DWG valide." };
  }
  if (ext === "dxf") {
    if (head.startsWith("AutoCAD Binary DXF")) return { ok: true, mime: "image/vnd.dxf", ext, note: "DXF binaire" };
    const text = ascii(start, 2048);
    return looksLikeText(start) && /(^|\n)\s*0\s*\r?\n\s*SECTION/.test(text)
      ? { ok: true, mime: "image/vnd.dxf", ext }
      : { ok: false, reason: "Ce fichier n’est pas un DXF valide." };
  }
  if (ext === "ifc") {
    return head.startsWith("ISO-10303-21;") ? { ok: true, mime: "application/x-step", ext } : { ok: false, reason: "Ce fichier n’est pas un IFC valide." };
  }
  if (ext === "csv" || ext === "txt") {
    return looksLikeText(start) ? { ok: true, mime: ext === "csv" ? "text/csv" : "text/plain", ext } : { ok: false, reason: "Ce fichier n’est pas un texte lisible." };
  }

  const detected = await fileTypeFromBuffer(start);
  if (!detected) return { ok: false, reason: "Type de fichier non reconnu." };
  const expected = EXPECTED[ext] ?? [];
  if (!expected.includes(detected.mime)) {
    return { ok: false, reason: `Le contenu (${detected.ext}) ne correspond pas à l’extension .${ext}.` };
  }
  return { ok: true, mime: detected.mime === "application/zip" && ext !== "zip" ? (EXPECTED[ext]![0] ?? detected.mime) : detected.mime, ext };
}
