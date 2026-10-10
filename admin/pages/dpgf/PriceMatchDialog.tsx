import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { type Currency, PRICE_ORIGIN_LABELS, type PriceOrigin, type PriceScope, PRICE_SCOPE_LABELS, type Reliability, RELIABILITY_LABELS } from "../../../shared/enums";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Dialog";
import { EmptyState, InlineError, Skeleton } from "../../components/ui/Feedback";
import { Segmented } from "../../components/ui/Segmented";
import { api, errorMessage } from "../../lib/api";
import { cn } from "../../lib/cn";
import { formatMoney, formatNumber } from "../../lib/format";
import { reliabilityTone } from "../../lib/prices";

interface Candidate {
  id: string;
  designation: string;
  unit: string;
  unitPrice: string;
  unitPriceHt: string;
  taxBasis: "HT" | "TTC" | null;
  priceDate: string;
  period: string | null;
  origin: PriceOrigin;
  scope: PriceScope | null;
  reliability: Reliability | null;
  zone: string | null;
  sourceName: string | null;
  verified: boolean;
}

interface Match {
  lineId: string;
  code: string | null;
  designation: string;
  unit: string | null;
  quantity: string | null;
  unitPrice: string | null;
  priceSource: string | null;
  candidates: Candidate[];
}

/**
 * Rapprochement des postes d'une DPGF avec la bibliothèque : pour chaque poste, les prix d'ouvrage de
 * même unité, classés par pertinence et proximité ; l'économiste choisit, rien n'est appliqué d'office.
 */
export function PriceMatchDialog({ dpgfId, currency, open, onOpenChange, onApplied }: { dpgfId: string; currency: Currency; open: boolean; onOpenChange: (open: boolean) => void; onApplied: () => void }) {
  const [scope, setScope] = useState<"non_chiffres" | "tous">("non_chiffres");
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Array<{ lineId: string; message: string }>>([]);
  useEffect(() => {
    if (open) {
      setChoices({});
      setErrors([]);
    }
  }, [open, scope]);
  const matches = useQuery({
    queryKey: ["dpgf", dpgfId, "price-matches", scope],
    queryFn: ({ signal }) => api<{ items: Match[]; total: number; truncated: boolean }>(`/dpgf/${dpgfId}/price-matches`, { body: { onlyUnpriced: scope === "non_chiffres" }, signal }),
    enabled: open,
    staleTime: 0,
  });
  const apply = useMutation({
    mutationFn: () => api<{ applied: number; errors: Array<{ lineId: string; message: string }> }>(`/dpgf/${dpgfId}/apply-prices`, { body: { assignments: Object.entries(choices).filter(([, id]) => id).map(([lineId, priceItemId]) => ({ lineId, priceItemId })) } }),
    onSuccess: (r) => {
      onApplied();
      setErrors(r.errors);
      if (r.applied) toast.success(`${r.applied} prix appliqué${r.applied > 1 ? "s" : ""}, poste${r.applied > 1 ? "s" : ""} à vérifier.`);
      if (r.errors.length === 0) onOpenChange(false);
      else void matches.refetch();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const items = matches.data?.items ?? [];
  const withCandidates = items.filter((m) => m.candidates.length > 0);
  const chosen = Object.values(choices).filter(Boolean).length;
  const errorOf = (lineId: string) => errors.find((e) => e.lineId === lineId)?.message;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Prix de la bibliothèque"
      description="Seuls les prix d’ouvrage de même unité sont proposés, fourniture et pose ou ouvrage complet ; les prix de matériaux servent aux sous-détails. Un prix retenu est appliqué hors taxes, avec sa provenance, et le poste passe à vérifier."
      size="lg"
      footer={
        <>
          <Button variant="secondary" disabled={withCandidates.length === 0} onClick={() => setChoices(Object.fromEntries(withCandidates.map((m) => [m.lineId, m.candidates[0]!.id])))}>
            Retenir le premier prix proposé
          </Button>
          <Button disabled={chosen === 0} loading={apply.isPending} onClick={() => apply.mutate()}>
            {chosen ? `Appliquer ${chosen} prix` : "Appliquer"}
          </Button>
        </>
      }
    >
      <Segmented
        value={scope}
        onChange={setScope}
        options={[
          { value: "non_chiffres", label: "Postes non chiffrés" },
          { value: "tous", label: "Tous les postes" },
        ]}
        label="Postes"
      />
      {matches.isPending ? (
        <Skeleton className="mt-4 h-48" />
      ) : matches.isError ? (
        <div className="mt-4">
          <InlineError>{errorMessage(matches.error)}</InlineError>
        </div>
      ) : items.length === 0 ? (
        <EmptyState className="mt-4" title={scope === "non_chiffres" ? "Tous les postes sont chiffrés" : "Aucun poste"} />
      ) : (
        <>
          <p className="mt-3 text-2xs text-ink-3">
            {`${withCandidates.length} poste${withCandidates.length > 1 ? "s" : ""} sur ${items.length} avec au moins un prix applicable.`}
            {matches.data?.truncated ? ` Les ${items.length} premiers postes sur ${matches.data.total} sont affichés.` : ""}
          </p>
          <ol className="mt-3 grid gap-3">
            {items.map((m) => (
              <li key={m.lineId} className="rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <p className="text-xs font-semibold text-ink">{[m.code, m.designation].filter(Boolean).join(" ")}</p>
                  <p className="text-2xs text-ink-3">{[m.unit ? `unité ${m.unit}` : "sans unité", m.quantity ? `quantité ${formatNumber(m.quantity)}` : null, m.unitPrice ? `prix actuel ${formatMoney(m.unitPrice, currency)}` : null].filter(Boolean).join(", ")}</p>
                </div>
                {errorOf(m.lineId) ? <p className="mt-1 text-2xs text-danger">{errorOf(m.lineId)}</p> : null}
                {m.candidates.length === 0 ? (
                  <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-2xs text-ink-2">Prix non disponible dans la bibliothèque : à chiffrer par sous-détail ou par saisie.</p>
                ) : (
                  <div className="mt-2 grid gap-1.5" role="radiogroup" aria-label={`Prix pour ${m.designation}`}>
                    {m.candidates.map((cand) => {
                      const selected = choices[m.lineId] === cand.id;
                      return (
                        <label key={cand.id} className={cn("flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2", selected ? "border-accent/40 bg-accent-soft" : "border-line hover:bg-surface-2")}>
                          <input type="radio" name={`ligne-${m.lineId}`} checked={selected} onChange={() => setChoices((x) => ({ ...x, [m.lineId]: cand.id }))} className="mt-0.5 size-4 accent-[var(--accent)]" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-xs text-ink">{cand.designation}</span>
                            <span className="block text-2xs text-ink-3">
                              {[cand.zone, cand.period ? `valeur ${cand.period}` : cand.priceDate.split("-").reverse().join("/"), cand.sourceName ?? PRICE_ORIGIN_LABELS[cand.origin], cand.scope ? PRICE_SCOPE_LABELS[cand.scope].toLowerCase() : null]
                                .filter(Boolean)
                                .join(", ")}
                            </span>
                            {cand.reliability ? (
                              <Badge tone={reliabilityTone[cand.reliability]} className="mt-1">
                                {`Fiabilité ${RELIABILITY_LABELS[cand.reliability].toLowerCase()}`}
                              </Badge>
                            ) : null}
                          </span>
                          <span className="shrink-0 text-right text-xs font-semibold text-ink tabular">
                            {formatMoney(cand.unitPriceHt, currency)} HT
                            {cand.taxBasis === "TTC" ? <span className="block text-2xs font-normal text-ink-3">{`publié ${formatMoney(cand.unitPrice, currency)} TTC`}</span> : null}
                          </span>
                        </label>
                      );
                    })}
                    {choices[m.lineId] ? (
                      <button type="button" className="justify-self-start text-2xs font-semibold text-ink-3 hover:text-ink" onClick={() => setChoices((x) => ({ ...x, [m.lineId]: "" }))}>
                        Ne rien appliquer à ce poste
                      </button>
                    ) : null}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
    </Modal>
  );
}
