import { useMutation, useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, Upload } from "lucide-react";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { COUNTRY_LABELS, CURRENCIES, PRICE_KIND_LABELS, PRICE_ORIGIN_LABELS } from "../../../shared/enums";
import { TRADE_FAMILIES } from "../../../shared/trades";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Dialog";
import { InlineError } from "../../components/ui/Feedback";
import { Field, optionsOf, SelectField } from "../../components/ui/Field";
import { api, ApiError, errorMessage } from "../../lib/api";
import { formatNumber } from "../../lib/format";
import type { Supplier } from "../../lib/types";

interface Preview {
  sheets: string[];
  sheet: string | null;
  rows: string[][];
  total: number;
  truncated: boolean;
}

interface ImportResult {
  imported: number;
  rejected: Array<{ row: number; reason: string }>;
  rejectedCount: number;
}

interface Columns {
  designation: number;
  unit: number;
  unitPrice: number;
  code: number | null;
  kind: number | null;
  priceDate: number | null;
}

const MAX_BYTES = 3 * 1024 * 1024;

/** Lettre de colonne à la manière d'Excel : A, B… Z, AA. */
function letter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Lecture du fichier impossible."));
    reader.readAsDataURL(file);
  });
}

const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

/** Colonnes devinées d'après les intitulés de la ligne d'en-tête, toujours modifiables. */
function guessColumns(headers: string[]): Columns {
  const h = headers.map(normalize);
  const find = (pattern: RegExp) => {
    const i = h.findIndex((x) => pattern.test(x));
    return i >= 0 ? i : null;
  };
  const last = Math.max(headers.length - 1, 0);
  return {
    designation: find(/designation|libelle|intitule|description|article/) ?? 0,
    unit: find(/^u$|^u\.|^unite|^unit/) ?? Math.min(1, last),
    unitPrice: find(/prix|^p\.? ?u|tarif|cout|montant/) ?? Math.min(2, last),
    code: find(/^code|^ref|^numero/),
    kind: find(/^nature|^type|^categorie/),
    priceDate: find(/date/),
  };
}

/** Import d'un fichier de prix : aperçu, correspondance des colonnes, valeurs par défaut, lignes refusées. */
export function PriceImportDialog({ open, onOpenChange, onImported }: { open: boolean; onOpenChange: (open: boolean) => void; onImported: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [file, setFile] = useState<{ name: string; base64: string } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [headerRow, setHeaderRow] = useState(0);
  const [columns, setColumns] = useState<Columns | null>(null);
  const [defaults, setDefaults] = useState({ kind: "materiau", currency: "MAD", country: "MA", origin: "devis_fournisseur", priceDate: today, tradeFamily: "", supplierId: "" });
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const suppliers = useQuery({ queryKey: ["library", "suppliers"], queryFn: ({ signal }) => api<{ items: Supplier[] }>("/library/suppliers", { signal }), enabled: open });

  const reset = () => {
    setFile(null);
    setPreview(null);
    setColumns(null);
    setResult(null);
    setError(null);
  };
  useEffect(() => {
    if (open) reset();
  }, [open]);

  async function load(next: { name: string; base64: string }, sheet: string | null) {
    setReading(true);
    setError(null);
    try {
      const p = await api<Preview>("/library/prices/import/preview", { body: { fileName: next.name, contentBase64: next.base64, sheet } });
      setFile(next);
      setPreview(p);
      setHeaderRow(0);
      setColumns(guessColumns(p.rows[0] ?? []));
      setResult(null);
    } catch (e) {
      setError(e instanceof ApiError && e.fields.fileName ? e.fields.fileName : errorMessage(e));
    } finally {
      setReading(false);
    }
  }

  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    event.target.value = "";
    if (!chosen) return;
    if (!/\.(csv|txt|xlsx)$/i.test(chosen.name)) return setError("Fichier CSV ou Excel .xlsx attendu. Un ancien classeur .xls doit d’abord être enregistré au format .xlsx.");
    if (chosen.size > MAX_BYTES) return setError("Fichier trop volumineux : 3 Mo au plus. Découpez-le en plusieurs fichiers.");
    try {
      await load({ name: chosen.name, base64: await readBase64(chosen) }, null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const run = useMutation({
    mutationFn: () =>
      api<ImportResult>("/library/prices/import", {
        body: {
          fileName: file!.name,
          contentBase64: file!.base64,
          sheet: preview?.sheet ?? null,
          headerRow,
          columns,
          defaults: { ...defaults, tradeFamily: defaults.tradeFamily || null, supplierId: defaults.supplierId || null },
        },
      }),
    onSuccess: (r) => {
      setResult(r);
      onImported();
      toast.success(r.imported ? `${r.imported} prix importé(s), à vérifier.` : "Aucun prix importé.");
    },
    onError: (e) => setError(e instanceof ApiError && Object.values(e.fields)[0] ? Object.values(e.fields)[0]! : errorMessage(e)),
  });

  const headers = preview?.rows[headerRow] ?? [];
  const width = Math.max(headers.length, ...(preview?.rows.map((r) => r.length) ?? [0]));
  const columnOptions = Array.from({ length: width }, (_, i) => ({ value: String(i), label: `${letter(i)}, ${headers[i] || "sans intitulé"}` }));
  const sample = preview ? preview.rows.slice(headerRow + 1, headerRow + 6) : [];
  const dataRows = preview ? Math.max(preview.total - headerRow - 1, 0) : 0;
  const setColumn = (key: keyof Columns, value: string, optional: boolean) => setColumns((c) => (c ? { ...c, [key]: value === "" && optional ? null : Number(value) } : c));
  const setDefault = (key: keyof typeof defaults, value: string) => setDefaults((d) => ({ ...d, [key]: value }));
  const mapped: Array<{ key: keyof Columns; label: string }> = [
    { key: "designation", label: "Désignation" },
    { key: "unit", label: "Unité" },
    { key: "unitPrice", label: "Prix" },
    { key: "code", label: "Code" },
    { key: "kind", label: "Nature" },
    { key: "priceDate", label: "Date" },
  ];

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Importer des prix"
      description="Bordereau, devis fournisseur, ancienne DPGF ou tableau personnel, en CSV ou Excel. Chaque prix importé garde le nom du fichier et sa ligne d’origine ; il est à vérifier jusqu’à votre confirmation."
      size="lg"
      footer={
        result ? (
          <>
            <Button variant="secondary" onClick={reset}>
              Importer un autre fichier
            </Button>
            <Button onClick={() => onOpenChange(false)}>Fermer</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button icon={<Upload className="size-4" />} loading={run.isPending} disabled={!preview || !columns || dataRows === 0} onClick={() => run.mutate()}>
              {preview ? `Importer ${formatNumber(dataRows)} ligne(s)` : "Importer"}
            </Button>
          </>
        )
      }
    >
      <input ref={input} type="file" accept=".csv,.txt,.xlsx" className="sr-only" onChange={pick} tabIndex={-1} aria-hidden="true" />
      <div className="grid gap-4">
        {error ? <InlineError>{error}</InlineError> : null}

        {result ? (
          <div className="grid gap-3">
            <div className="rounded-xl border border-success/25 bg-success-soft p-4">
              <p className="text-sm font-semibold text-ink">{result.imported} prix importé(s)</p>
              <p className="mt-0.5 text-xs text-ink-2">Ils sont à vérifier : l’agent peut les proposer, le contrôle qualité les signale jusqu’à votre vérification.</p>
            </div>
            {result.rejectedCount ? (
              <div className="rounded-xl border border-line p-4">
                <p className="text-xs font-semibold text-ink">{result.rejectedCount} ligne(s) refusée(s)</p>
                <ul className="mt-2 grid max-h-56 gap-1 overflow-y-auto text-2xs text-ink-2">
                  {result.rejected.map((r) => (
                    <li key={r.row}>
                      Ligne {r.row} : {r.reason}
                    </li>
                  ))}
                </ul>
                {result.rejectedCount > result.rejected.length ? <p className="mt-2 text-2xs text-ink-3">Les 50 premières sont affichées.</p> : null}
              </div>
            ) : null}
          </div>
        ) : !preview ? (
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={reading}
            className="grid place-items-center gap-2 rounded-card border border-dashed border-line-strong bg-surface-2 px-6 py-10 text-center hover:border-accent disabled:opacity-60"
          >
            <FileSpreadsheet className="size-7 text-ink-3" aria-hidden="true" />
            <span className="text-sm font-semibold text-ink">{reading ? "Lecture du fichier…" : "Choisir un fichier"}</span>
            <span className="max-w-md text-2xs leading-relaxed text-ink-3">
              CSV avec point-virgule, virgule ou tabulation, ou classeur Excel .xlsx ; 3 Mo et 5 000 lignes au plus. Les montants écrits « 1 250,50 » et les dates « 31/12/2025 » sont reconnus.
            </span>
          </button>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3">
              <FileSpreadsheet className="size-5 shrink-0 text-accent" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-ink">{file?.name}</p>
                <p className="text-2xs text-ink-3">
                  {formatNumber(preview.total)} ligne(s) lue(s)
                  {preview.truncated ? ", seules les 5 000 premières sont prises en compte" : ""}
                </p>
              </div>
              <Button size="sm" variant="secondary" loading={reading} onClick={() => input.current?.click()}>
                Changer de fichier
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {preview.sheets.length > 1 ? (
                <SelectField label="Feuille" options={preview.sheets.map((s) => ({ value: s, label: s }))} value={preview.sheet ?? ""} onChange={(e) => file && void load(file, e.target.value)} />
              ) : null}
              <SelectField
                label="Ligne d’en-tête"
                options={preview.rows.slice(0, 10).map((r, i) => ({ value: String(i), label: `Ligne ${i + 1}, ${r.filter(Boolean).slice(0, 3).join(", ")}` }))}
                value={String(headerRow)}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setHeaderRow(next);
                  setColumns(guessColumns(preview.rows[next] ?? []));
                }}
                hint="Les lignes suivantes sont importées."
              />
            </div>

            {columns ? (
              <div>
                <p className="text-xs font-semibold text-ink-2">Correspondance des colonnes</p>
                <div className="mt-2 grid gap-3 sm:grid-cols-3">
                  {mapped.map(({ key, label }) => {
                    const optional = key === "code" || key === "kind" || key === "priceDate";
                    return (
                      <SelectField
                        key={key}
                        label={label}
                        optional={optional}
                        placeholder={optional ? "Aucune" : undefined}
                        options={columnOptions}
                        value={columns[key] === null ? "" : String(columns[key])}
                        onChange={(e) => setColumn(key, e.target.value, optional)}
                      />
                    );
                  })}
                </div>
              </div>
            ) : null}

            {columns && sample.length ? (
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full min-w-[36rem] text-left text-2xs">
                  <thead>
                    <tr className="border-b border-line bg-surface-2 text-ink-3">
                      {mapped.map(({ key, label }) => (columns[key] !== null ? <th key={key} className="px-3 py-2 font-semibold">{label}</th> : null))}
                    </tr>
                  </thead>
                  <tbody>
                    {sample.map((row, i) => (
                      <tr key={i} className="border-b border-line last:border-0">
                        {mapped.map(({ key }) => (columns[key] !== null ? <td key={key} className="max-w-56 truncate px-3 py-2 text-ink-2">{row[columns[key]!] ?? ""}</td> : null))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            <div>
              <p className="text-xs font-semibold text-ink-2">Valeurs communes</p>
              <p className="mt-0.5 text-2xs text-ink-3">Appliquées à toutes les lignes ; la nature et la date du fichier priment quand leur colonne est indiquée et lisible.</p>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <SelectField label="Nature" options={optionsOf(PRICE_KIND_LABELS)} value={defaults.kind} onChange={(e) => setDefault("kind", e.target.value)} />
                <SelectField label="Provenance" options={optionsOf(PRICE_ORIGIN_LABELS)} value={defaults.origin} onChange={(e) => setDefault("origin", e.target.value)} />
                <SelectField label="Devise" options={CURRENCIES.map((c) => ({ value: c, label: c }))} value={defaults.currency} onChange={(e) => setDefault("currency", e.target.value)} />
                <SelectField label="Pays" options={optionsOf(COUNTRY_LABELS)} value={defaults.country} onChange={(e) => setDefault("country", e.target.value)} />
                <Field label="Date des prix" type="date" value={defaults.priceDate} onChange={(e) => setDefault("priceDate", e.target.value)} />
                <SelectField label="Famille" optional placeholder="Aucune" options={TRADE_FAMILIES.map((t) => ({ value: t.key, label: t.label }))} value={defaults.tradeFamily} onChange={(e) => setDefault("tradeFamily", e.target.value)} />
                <SelectField
                  label="Fournisseur"
                  optional
                  placeholder="Aucun"
                  className="sm:col-span-2"
                  options={(suppliers.data?.items ?? []).map((s) => ({ value: s.id, label: s.name }))}
                  value={defaults.supplierId}
                  onChange={(e) => setDefault("supplierId", e.target.value)}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
