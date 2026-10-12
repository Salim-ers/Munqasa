import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { Currency } from "../../../shared/enums";
import { PRICE_KIND_LABELS, RELIABILITY_LABELS } from "../../../shared/enums";
import { isHistoricalPrice } from "../../../shared/prices";
import type { AlertSettings } from "../../../shared/settings";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Dialog";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import { SearchInput } from "../../components/ui/SearchInput";
import { api, query } from "../../lib/api";
import { cn } from "../../lib/cn";
import { formatMoney } from "../../lib/format";
import { reliabilityTone, whenLabel, zoneLabel } from "../../lib/prices";
import { unitLabel } from "../../lib/quotes";
import type { Paged, PriceItem } from "../../lib/types";

/**
 * Choix de prix de la bibliothèque pour un devis : recherche, sélection multiple, prix publié et hors taxes,
 * date, fiabilité ; un prix historique, à vérifier ou réglementaire est signalé avant d'être retenu.
 */
export function PricePickerDialog({ open, onOpenChange, currency, onPick, busy = false }: { open: boolean; onOpenChange: (open: boolean) => void; currency: Currency; onPick: (ids: string[]) => void; busy?: boolean }) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {
    if (open) setSelected([]);
  }, [open]);
  const alerts = useQuery({ queryKey: ["settings", "alertes"], queryFn: ({ signal }) => api<{ value: AlertSettings }>("/settings/alertes", { signal }), enabled: open });
  const prices = useQuery({
    queryKey: ["library", "picker", currency, q],
    queryFn: ({ signal }) => api<Paged<PriceItem>>(`/library/prices${query({ q, devise: currency, pageSize: 30 })}`, { signal }),
    enabled: open,
    placeholderData: keepPreviousData,
  });
  const stale = alerts.data?.value.stalePriceMonths;
  const items = (prices.data?.items ?? []).filter((p) => p.kind !== "ratio");
  const toggle = (id: string) => setSelected((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Ajouter des prix de la bibliothèque"
      description={`Prix en ${currency}, repris hors taxes avec leur provenance. Un prix historique, à vérifier ou réglementaire devra être confirmé avant l’envoi du devis.`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button disabled={selected.length === 0} loading={busy} onClick={() => onPick(selected)}>
            {selected.length ? `Ajouter ${selected.length} prix` : "Ajouter"}
          </Button>
        </>
      }
    >
      <SearchInput value={q} onChange={setQ} placeholder="Désignation, code, ville" label="Rechercher un prix" />
      <div className="mt-3 grid gap-1.5">
        {prices.isPending ? (
          <Skeleton className="h-40" />
        ) : items.length === 0 ? (
          <EmptyState title="Aucun prix trouvé" text="Essayez une autre désignation, ou ajoutez vos prix dans la bibliothèque." />
        ) : (
          items.map((p) => {
            const checked = selected.includes(p.id);
            const historical = isHistoricalPrice(p, stale);
            return (
              <label key={p.id} className={cn("flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2", checked ? "border-accent/40 bg-accent-soft" : "border-line hover:bg-surface-2")}>
                <input type="checkbox" checked={checked} onChange={() => toggle(p.id)} className="mt-0.5 size-4 accent-[var(--accent)]" />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-ink">{p.designation}</span>
                  <span className="block text-2xs text-ink-3">{[PRICE_KIND_LABELS[p.kind], zoneLabel(p), whenLabel(p), p.sourceName].filter(Boolean).join(", ")}</span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {p.reliability ? <Badge tone={reliabilityTone[p.reliability]}>{`Fiabilité ${RELIABILITY_LABELS[p.reliability].toLowerCase()}`}</Badge> : null}
                    {historical ? <Badge tone="warning">Historique</Badge> : null}
                    {p.regulated ? <Badge tone="warning">Salaire minimal, hors charges</Badge> : null}
                    {p.verificationStatus === "a_verifier" ? <Badge>À vérifier</Badge> : null}
                  </span>
                </span>
                <span className="shrink-0 text-right text-xs font-semibold text-ink tabular">
                  {formatMoney(p.unitPrice, p.currency)}
                  <span className="block text-2xs font-normal text-ink-3">{[`/ ${unitLabel(p.unit)}`, p.taxBasis].filter(Boolean).join(" ")}</span>
                </span>
              </label>
            );
          })
        )}
      </div>
    </Modal>
  );
}
