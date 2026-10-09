import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Library, LockOpen, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { COMPONENT_CATEGORY_LABELS, type Currency, MARGIN_MODE_LABELS, PRICE_KIND_LABELS, RATE_BASE_LABELS, VALIDATION_STATUS_LABELS } from "../../../shared/enums";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Dialog";
import { EmptyState, InlineError, Skeleton } from "../../components/ui/Feedback";
import { Field, optionsOf, SelectField } from "../../components/ui/Field";
import { ActionMenu } from "../../components/ui/Menu";
import { SearchInput } from "../../components/ui/SearchInput";
import { Segmented } from "../../components/ui/Segmented";
import { api, ApiError, errorMessage, query } from "../../lib/api";
import { cn } from "../../lib/cn";
import { formatDate, formatMoney, formatNumber } from "../../lib/format";
import type { Breakdown, BreakdownComponent, DpgfLine, Paged, PriceItem } from "../../lib/types";
import { EditableCell } from "../dpgf/DpgfView";
import { breakdownState } from "./state";

type Rates = Pick<Breakdown, "overheadBase" | "contingencyBase" | "marginMode"> & { overheadRate: string; contingencyRate: string; marginRate: string };

const asInput = (value: string | null) => (value === null ? "" : String(Number(value)).replace(".", ","));
const ratesOf = (b: Breakdown): Rates => ({
  overheadRate: asInput(b.overheadRate),
  overheadBase: b.overheadBase,
  contingencyRate: asInput(b.contingencyRate),
  contingencyBase: b.contingencyBase,
  marginRate: asInput(b.marginRate),
  marginMode: b.marginMode,
});

function fieldError(e: unknown): string {
  return e instanceof ApiError && Object.values(e.fields)[0] ? Object.values(e.fields)[0]! : errorMessage(e);
}

/** Recherche d'un prix de la bibliothèque, dans la devise du sous-détail. */
function PricePicker({ currency, onPick, onCancel }: { currency: Currency; onPick: (price: PriceItem) => void; onCancel?: () => void }) {
  const [q, setQ] = useState("");
  const results = useQuery({
    queryKey: ["library", "picker", currency, q],
    queryFn: ({ signal }) => api<Paged<PriceItem>>(`/library/prices${query({ q, devise: currency, pageSize: 8 })}`, { signal }),
    enabled: q.length >= 2,
  });
  const items = (results.data?.items ?? []).filter((p) => p.verificationStatus !== "rejete");
  return (
    <div className="grid gap-2 rounded-xl border border-line bg-surface-2 p-3">
      <SearchInput value={q} onChange={setQ} placeholder="Rechercher dans la bibliothèque" label="Rechercher un prix" />
      {q.length < 2 ? (
        <p className="text-2xs text-ink-3">Deux lettres au moins ; seuls les prix en {currency} sont proposés.</p>
      ) : results.isPending ? (
        <Skeleton className="h-14" />
      ) : items.length === 0 ? (
        <p className="text-2xs text-ink-3">Aucun prix ne correspond.</p>
      ) : (
        <ul className="grid gap-1">
          {items.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => onPick(p)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-0.5 rounded-lg bg-surface px-3 py-2 text-left hover:bg-accent-soft">
                <span className="min-w-0 flex-1 basis-40">
                  <span className="block text-xs font-semibold text-ink">{p.designation}</span>
                  <span className="block text-2xs text-ink-3">{[PRICE_KIND_LABELS[p.kind], `prix du ${formatDate(p.priceDate)}`, VALIDATION_STATUS_LABELS[p.verificationStatus].toLowerCase()].join(", ")}</span>
                </span>
                <span className="shrink-0 text-xs font-semibold text-ink tabular">
                  {formatMoney(p.unitPrice, p.currency)} / {p.unit}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {onCancel ? (
        <Button size="sm" variant="ghost" className="justify-self-end" onClick={onCancel}>
          Annuler
        </Button>
      ) : null}
    </div>
  );
}

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="px-2 text-[0.625rem] font-semibold tracking-wide text-ink-3 uppercase">{label}</p>
      {children}
    </div>
  );
}

/** Éditeur d'un sous-détail : composants, coûts reliés à la bibliothèque, taux, résultat calculé par le serveur. */
export function BreakdownDialog({ projectId, currency, entry, onOpenChange }: { projectId: string; currency: Currency; entry: { line: DpgfLine; breakdown: Breakdown | null } | null; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["project", projectId] });
  const open = entry !== null;
  const b = entry?.breakdown ?? null;
  const locked = Boolean(b?.locked);
  const [rates, setRates] = useState<Rates | null>(null);
  const [rateError, setRateError] = useState<string | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRates(b ? ratesOf(b) : null);
    setRateError(null);
    setPicking(null);
    setAdding(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, b?.id]);

  const create = useMutation({
    mutationFn: () => api(`/dpgf/lines/${entry!.line.id}/breakdown`, { body: {} }),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const saveRates = useMutation({
    mutationFn: (r: Rates) => api(`/breakdowns/${b!.id}`, { method: "PATCH", body: r }),
    onSuccess: () => {
      setRateError(null);
      toast.success("Taux enregistrés, prix recalculé.");
      void refresh();
    },
    onError: (e) => setRateError(fieldError(e)),
  });
  const validate = useMutation({
    mutationFn: (validated: boolean) => api(`/breakdowns/${b!.id}/validate`, { body: { validated } }),
    onSuccess: (_, validated) => {
      toast.success(validated ? "Sous-détail validé et figé." : "Sous-détail rouvert.");
      void refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const patchComponent = async (id: string, body: Record<string, unknown>) => {
    try {
      await api(`/breakdown-components/${id}`, { method: "PATCH", body });
      await refresh();
    } catch (e) {
      toast.error(fieldError(e));
      throw e;
    }
  };
  const removeComponent = useMutation({
    mutationFn: (id: string) => api(`/breakdown-components/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  });

  const line = entry?.line;
  const state = breakdownState(b);
  const result = b?.result;
  const ratesDirty = b && rates ? JSON.stringify(rates) !== JSON.stringify(ratesOf(b)) : false;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={line ? `${line.code ?? ""} ${line.designation}`.trim() : "Sous-détail"}
      description={line ? `Prix pour 1 ${line.unit ?? "u"}, en ${currency}. Un coût relié à la bibliothèque est celui du prix choisi ; une consommation proposée par l’agent reste une hypothèse tant que vous ne l’avez pas modifiée.` : undefined}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
          {b ? (
            locked ? (
              <Button variant="secondary" icon={<LockOpen className="size-4" />} loading={validate.isPending} onClick={() => validate.mutate(false)}>
                Rouvrir
              </Button>
            ) : (
              <Button icon={<ShieldCheck className="size-4" />} loading={validate.isPending} disabled={b.computedUnitPrice === null || ratesDirty} onClick={() => validate.mutate(true)}>
                Valider le sous-détail
              </Button>
            )
          ) : null}
        </>
      }
    >
      {!b ? (
        <EmptyState
          title="Aucun sous-détail pour ce poste"
          text="Lancez l’agent depuis l’onglet, ou établissez-le à la main avec les prix de votre bibliothèque."
          action={
            <Button size="sm" icon={<Plus className="size-3.5" />} loading={create.isPending} onClick={() => create.mutate()}>
              Établir à la main
            </Button>
          }
        />
      ) : (
        <div className="grid gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={state.tone} dot>
              {state.label}
            </Badge>
            {line?.quantity ? <span className="text-2xs text-ink-3">{`${formatNumber(line.quantity)} ${line.unit ?? ""} à la DPGF`}</span> : null}
          </div>
          {b.notes ? <p className="rounded-xl bg-surface-2 p-3 text-2xs leading-relaxed text-ink-2">{b.notes}</p> : null}

          <section>
            <h3 className="text-xs font-semibold text-ink">Composants</h3>
            {b.components.length === 0 ? (
              <p className="mt-2 text-2xs text-ink-3">Aucun composant pour l’instant.</p>
            ) : (
              <ul className="mt-2 grid gap-2">
                {b.components.map((c, i) => (
                  <ComponentRow
                    key={c.id}
                    component={c}
                    total={"error" in b.result ? null : (b.result.componentTotals[i] ?? null)}
                    currency={currency}
                    locked={locked}
                    picking={picking === c.id}
                    onPick={(on) => setPicking(on ? c.id : null)}
                    onPatch={(body) => patchComponent(c.id, body)}
                    onRemove={() => removeComponent.mutate(c.id)}
                  />
                ))}
              </ul>
            )}
            {!locked ? (
              adding ? (
                <AddComponent breakdownId={b.id} currency={currency} onDone={() => setAdding(false)} onSaved={refresh} />
              ) : (
                <Button size="sm" variant="secondary" className="mt-3" icon={<Plus className="size-3.5" />} onClick={() => setAdding(true)}>
                  Ajouter un composant
                </Button>
              )
            ) : null}
          </section>

          {rates ? (
            <section>
              <h3 className="text-xs font-semibold text-ink">Frais et marge</h3>
              {rateError ? (
                <div className="mt-2">
                  <InlineError>{rateError}</InlineError>
                </div>
              ) : null}
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <Field label="Frais généraux (%)" optional inputMode="decimal" disabled={locked} value={rates.overheadRate} onChange={(e) => setRates({ ...rates, overheadRate: e.target.value })} />
                <SelectField label="Calculés sur" options={optionsOf(RATE_BASE_LABELS)} disabled={locked} value={rates.overheadBase} onChange={(e) => setRates({ ...rates, overheadBase: e.target.value as Rates["overheadBase"] })} />
                <Field label="Aléas (%)" optional inputMode="decimal" disabled={locked} value={rates.contingencyRate} onChange={(e) => setRates({ ...rates, contingencyRate: e.target.value })} />
                <SelectField label="Calculés sur" options={optionsOf(RATE_BASE_LABELS)} disabled={locked} value={rates.contingencyBase} onChange={(e) => setRates({ ...rates, contingencyBase: e.target.value as Rates["contingencyBase"] })} />
                <SelectField label="Mode de marge" options={optionsOf(MARGIN_MODE_LABELS)} disabled={locked} value={rates.marginMode} onChange={(e) => setRates({ ...rates, marginMode: e.target.value as Rates["marginMode"] })} />
                <Field
                  label={rates.marginMode === "coefficient" ? "Coefficient" : rates.marginMode === "taux_de_marque" ? "Taux de marque (%)" : "Taux de marge (%)"}
                  optional
                  inputMode="decimal"
                  disabled={locked}
                  value={rates.marginRate}
                  onChange={(e) => setRates({ ...rates, marginRate: e.target.value })}
                />
              </div>
              {ratesDirty ? (
                <div className="mt-3 flex justify-end gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setRates(ratesOf(b))}>
                    Annuler
                  </Button>
                  <Button size="sm" loading={saveRates.isPending} onClick={() => saveRates.mutate(rates)}>
                    Enregistrer les taux
                  </Button>
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="rounded-xl border border-line p-4">
            <h3 className="text-xs font-semibold text-ink">Résultat</h3>
            {!result ? null : "error" in result ? (
              <p className="mt-2 text-xs text-danger">{result.error}</p>
            ) : (
              <dl className="mt-2 grid gap-1.5 text-xs">
                {(
                  [
                    ["Déboursé sec", result.debourseSec],
                    ["Frais de chantier", result.fraisChantier],
                    ["Déboursé total", result.debourseTotal],
                    ["Frais généraux", result.overhead],
                    ["Aléas", result.contingency],
                    ["Prix de revient", result.prixDeRevient],
                    ["Marge", result.margin],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-3">
                    <dt className="text-ink-3">{label}</dt>
                    <dd className="text-ink tabular">{formatMoney(value, currency)}</dd>
                  </div>
                ))}
                <div className="mt-1 flex items-center justify-between gap-3 border-t border-line pt-2">
                  <dt className="font-semibold text-ink">Prix de vente unitaire</dt>
                  <dd className={cn("text-base font-semibold tabular", result.prixDeVente ? "text-accent" : "text-warning")}>{result.prixDeVente ? formatMoney(result.prixDeVente, currency) : "composant à chiffrer"}</dd>
                </div>
              </dl>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}

function ComponentRow({
  component: c,
  total,
  currency,
  locked,
  picking,
  onPick,
  onPatch,
  onRemove,
}: {
  component: BreakdownComponent;
  total: string | null;
  currency: Currency;
  locked: boolean;
  picking: boolean;
  onPick: (on: boolean) => void;
  onPatch: (body: Record<string, unknown>) => Promise<void>;
  onRemove: () => void;
}) {
  const text = (value: string) => <p className="min-h-8 px-2 py-1 text-xs text-ink">{value}</p>;
  return (
    <li className="rounded-xl border border-line p-3">
      <div className="flex items-start gap-2">
        <Badge className="mt-1.5 shrink-0">{COMPONENT_CATEGORY_LABELS[c.category]}</Badge>
        <div className="min-w-0 flex-1">{locked ? text(c.designation) : <EditableCell label="Composant" value={c.designation} display={c.designation} onSave={(v) => onPatch({ designation: v ?? "" })} />}</div>
        {!locked ? (
          <ActionMenu
            actions={[
              { label: c.priceItemId ? "Choisir un autre prix" : "Choisir un prix de la bibliothèque", icon: <Library />, onSelect: () => onPick(true) },
              { label: "Supprimer", icon: <Trash2 />, tone: "danger", onSelect: onRemove },
            ]}
          />
        ) : null}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Cell label={`Consommation, ${c.unit}`}>
          {locked ? (
            text(formatNumber(c.quantity))
          ) : (
            <EditableCell
              label="Consommation"
              value={c.quantity}
              display={formatNumber(c.quantity)}
              numeric
              onSave={async (v) => {
                if (v === null) {
                  toast.error("Indiquez une consommation.");
                  throw new Error("vide");
                }
                await onPatch({ quantity: v });
              }}
            />
          )}
        </Cell>
        <Cell label={c.priceItemId ? "Coût, bibliothèque" : "Coût saisi"}>
          {locked ? (
            text(c.unitCost !== null ? formatMoney(c.unitCost, currency) : "à chiffrer")
          ) : (
            <EditableCell label="Coût unitaire" value={c.unitCost} display={c.unitCost !== null ? formatMoney(c.unitCost, currency) : ""} placeholder="à chiffrer" numeric onSave={(v) => onPatch({ unitCost: v })} />
          )}
        </Cell>
        <Cell label="Pertes">
          {locked ? (
            text(c.lossRate !== null ? `${formatNumber(c.lossRate)} %` : "aucune")
          ) : (
            <EditableCell label="Pertes" value={c.lossRate} display={c.lossRate !== null ? `${formatNumber(c.lossRate)} %` : ""} placeholder="aucune" numeric onSave={(v) => onPatch({ lossRate: v })} />
          )}
        </Cell>
        <Cell label="Coût par unité">{text(total !== null ? formatMoney(total, currency) : "")}</Cell>
      </div>
      {c.isHypothesis || c.sourceNote ? (
        <p className="mt-2 flex flex-wrap items-center gap-1.5 px-2 text-2xs leading-relaxed text-ink-3">
          {c.isHypothesis ? <Badge tone="warning">Hypothèse</Badge> : null}
          {c.sourceNote}
        </p>
      ) : null}
      {picking ? (
        <div className="mt-2">
          <PricePicker
            currency={currency}
            onPick={(price) => {
              void onPatch({ priceItemId: price.id })
                .then(() => onPick(false))
                .catch(() => undefined);
            }}
            onCancel={() => onPick(false)}
          />
        </div>
      ) : null}
    </li>
  );
}

function AddComponent({ breakdownId, currency, onDone, onSaved }: { breakdownId: string; currency: Currency; onDone: () => void; onSaved: () => Promise<unknown> }) {
  const [values, setValues] = useState({ category: "materiau", designation: "", unit: "", quantity: "", unitCost: "", lossRate: "" });
  const [mode, setMode] = useState<"bibliotheque" | "saisie">("bibliotheque");
  const [price, setPrice] = useState<PriceItem | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      api(`/breakdowns/${breakdownId}/components`, {
        body: {
          category: values.category,
          designation: values.designation || price?.designation || "",
          unit: mode === "bibliotheque" ? (price?.unit ?? "") : values.unit,
          quantity: values.quantity,
          unitCost: mode === "saisie" ? values.unitCost || null : null,
          lossRate: values.lossRate || null,
          priceItemId: mode === "bibliotheque" ? (price?.id ?? null) : null,
        },
      }),
    onSuccess: async () => {
      await onSaved();
      onDone();
    },
    onError: (e) => (e instanceof ApiError && Object.keys(e.fields).length ? setErrors(e.fields) : setGeneral(errorMessage(e))),
  });

  const set = (key: keyof typeof values, value: string) => setValues((v) => ({ ...v, [key]: value }));
  return (
    <div className="mt-3 grid gap-3 rounded-xl border border-accent/30 p-3">
      {general ? <InlineError>{general}</InlineError> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label="Catégorie" options={optionsOf(COMPONENT_CATEGORY_LABELS)} value={values.category} onChange={(e) => set("category", e.target.value)} />
        <Field label="Composant" value={values.designation} onChange={(e) => set("designation", e.target.value)} error={errors.designation} placeholder={price?.designation ?? "Béton, maçon, bétonnière…"} />
        <Field label="Consommation par unité d’ouvrage" inputMode="decimal" value={values.quantity} onChange={(e) => set("quantity", e.target.value)} error={errors.quantity} />
        <Field label="Pertes (%)" optional inputMode="decimal" value={values.lossRate} onChange={(e) => set("lossRate", e.target.value)} error={errors.lossRate} />
      </div>
      <Segmented
        value={mode}
        onChange={setMode}
        label="Coût"
        options={[
          { value: "bibliotheque", label: "Prix de la bibliothèque" },
          { value: "saisie", label: "Coût saisi" },
        ]}
      />
      {mode === "bibliotheque" ? (
        price ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-surface-2 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-ink">{price.designation}</p>
              <p className="text-2xs text-ink-3">{`${formatMoney(price.unitPrice, price.currency)} / ${price.unit}, prix du ${formatDate(price.priceDate)}`}</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setPrice(null)}>
              Changer
            </Button>
          </div>
        ) : (
          <PricePicker currency={currency} onPick={setPrice} />
        )
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Unité" value={values.unit} onChange={(e) => set("unit", e.target.value)} error={errors.unit} placeholder="m3, kg, h" />
          <Field label={`Coût unitaire en ${currency}`} inputMode="decimal" value={values.unitCost} onChange={(e) => set("unitCost", e.target.value)} error={errors.unitCost} />
        </div>
      )}
      {errors.priceItemId ? <InlineError>{errors.priceItemId}</InlineError> : null}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="secondary" onClick={onDone}>
          Annuler
        </Button>
        <Button size="sm" loading={save.isPending} disabled={!values.quantity || (mode === "bibliotheque" ? !price : !values.unit)} onClick={() => save.mutate()}>
          Ajouter
        </Button>
      </div>
    </div>
  );
}
