import { useMutation, useQuery } from "@tanstack/react-query";
import { Archive } from "lucide-react";
import { toast } from "sonner";
import { PRICE_ORIGIN_LABELS } from "../../../shared/enums";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Dialog";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import { api, errorMessage } from "../../lib/api";
import { formatMoney } from "../../lib/format";
import { whenLabel, zoneLabel } from "../../lib/prices";
import type { PriceItem } from "../../lib/types";

/** Doublons probables : prix en service de même désignation, même unité et même zone. */
export function DuplicatesDialog({ open, onOpenChange, country, onOpenPrice, onChanged }: { open: boolean; onOpenChange: (open: boolean) => void; country: string; onOpenPrice: (id: string) => void; onChanged: () => void }) {
  const duplicates = useQuery({
    queryKey: ["library", "duplicates", country],
    queryFn: ({ signal }) => api<{ groups: Array<{ count: number; items: PriceItem[] }> }>(`/library/duplicates${country ? `?pays=${country}` : ""}`, { signal }),
    enabled: open,
  });
  const archive = useMutation({
    mutationFn: (id: string) => api(`/library/prices/${id}/archive`, { body: { archived: true } }),
    onSuccess: () => {
      void duplicates.refetch();
      onChanged();
      toast.success("Prix archivé : il reste consultable dans les archives.");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const groups = duplicates.data?.groups ?? [];
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Doublons probables"
      description="Prix en service de même désignation, même unité et même zone. Comparez leur provenance et archivez ceux qui font double emploi ; rien n’est supprimé."
      size="lg"
    >
      {duplicates.isPending ? (
        <Skeleton className="h-48" />
      ) : groups.length === 0 ? (
        <EmptyState title="Aucun doublon" text="Aucun prix en service ne partage désignation, unité et zone avec un autre." />
      ) : (
        <ol className="grid gap-3">
          {groups.map((g) => (
            <li key={g.items.map((i) => i.id).join("-")} className="rounded-xl border border-line">
              <p className="border-b border-line px-3 py-2 text-xs font-semibold text-ink">
                {g.items[0]?.designation}
                <span className="font-normal text-ink-3">{`, ${g.count} prix, ${g.items[0] ? zoneLabel(g.items[0]) : ""}`}</span>
              </p>
              <ul>
                {g.items.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-3 py-2 last:border-b-0">
                    <button type="button" onClick={() => onOpenPrice(p.id)} className="min-w-0 flex-1 text-left">
                      <p className="text-xs font-semibold text-ink tabular">
                        {formatMoney(p.unitPrice, p.currency)}
                        <span className="font-normal text-ink-3">{` / ${p.unit}${p.taxBasis ? ` ${p.taxBasis}` : ""}`}</span>
                      </p>
                      <p className="truncate text-2xs text-ink-3">{[whenLabel(p), p.sourceName ?? PRICE_ORIGIN_LABELS[p.origin], p.supplierName, p.sourceRef].filter(Boolean).join(", ")}</p>
                    </button>
                    <Button size="sm" variant="ghost" icon={<Archive className="size-3.5" />} loading={archive.isPending && archive.variables === p.id} onClick={() => archive.mutate(p.id)}>
                      Archiver
                    </Button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}
