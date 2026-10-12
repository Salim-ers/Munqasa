/**
 * Texte vectoriel de la première page d'un plan PDF, lu dans le navigateur : cartouche, titres et mentions.
 * Rien ne quitte le poste à cette étape ; seul ce texte, sans les cotes, est envoyé ensuite au serveur pour le
 * préremplissage, après accord explicite. La bibliothèque de lecture n'est chargée qu'à la première demande.
 */
type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let loading: Promise<PdfJs> | null = null;

async function pdfjs(): Promise<PdfJs> {
  loading ??= (async () => {
    const [lib, worker] = await Promise.all([import("pdfjs-dist/legacy/build/pdf.mjs"), import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")]);
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    return lib;
  })();
  return loading;
}

/** Lignes de texte de la première page (au plus 30 000 caractères), cotes et nombres isolés écartés. */
export async function firstPageText(file: File): Promise<string> {
  const lib = await pdfjs();
  const task = lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), disableFontFace: true, verbosity: 0 });
  try {
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const content = await page.getTextContent();
    const lines: string[] = [];
    for (const item of content.items) {
      const text = "str" in item ? item.str.replace(/\s+/g, " ").trim() : "";
      if (text && /\p{L}{2,}/u.test(text)) lines.push(text);
    }
    page.cleanup();
    return lines.join("\n").slice(0, 30_000);
  } finally {
    await task.destroy();
  }
}
