import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Copy, ExternalLink, Pencil } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import {
  PRICE_KIND_LABELS,
  PRICE_ORIGIN_LABELS,
  PRICE_SCOPE_LABELS,
  PRICE_VALUE_STATUS_LABELS,
  RELIABILITY_LABELS,
  VALIDATION_STATUS_LABELS,
} from "../../../shared/enums";
import { priceExclTax } from "../../../shared/prices";
import { tradeLabel } from "../../../shared/trades";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Dialog";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import { TabPanel, Tabs } from "../../components/ui/Tabs";
import { api, errorMessage } from "../../lib/api";
import { cn } from "../../lib/cn";
import { formatDate, formatDateTime, formatMoney, formatNumber } from "../../lib/format";
import { reliabilityTone, whenLabel, zoneLabel } from "../../lib/prices";
import type { PriceHistoryEntry, PriceItem, PriceSourceInfo } from "../../lib/types";


interface Detail {
  price: PriceItem;
  source: PriceSourceInfo | null;
  importBatch: { id: string; label: string; status: string; createdAt: string } | null;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-line py-2.5 last:border-b-0 sm:grid-cols-[11rem_1fr] sm:gap-4">
      <dt className="text-2xs font-semibold text-ink-3">{label}</dt>
      <dd className="min-w-0 text-xs leading-relaxed text-ink-2">{children}</dd>
    </div>
  );
}

function SourceLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold break-all text-accent hover:underline">
      {children}
      <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
    </a>
  );
}

/** Fiche d'un prix : valeur, provenance complète, série publiée, comparaison des déclinaisons, historique. */
export function PriceDetailDialog({
  priceId,
  initialTab = "valeur",
  onOpenChange,
  onEdit,
  onDuplicated,
  onChanged,
}: {
  priceId: string | null;
  initialTab?: "valeur" | "serie" | "comparaison" | "historique";
  onOpenChange: (open: boolean) => void;
  onEdit: (price: PriceItem) => void;
  onDuplicated: (price: PriceItem) => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<string>(initialTab);
  useEffect(() => {
    if (priceId) setTab(initialTab);
  }, [priceId, initialTab]);
  const detail = useQuery({ queryKey: ["library", "detail", priceId], queryFn: ({ signal }) => api<Detail>(`/library/prices/${priceId}`, { signal }), enabled: Boolean(priceId) });
  const compare = useQuery({ queryKey: ["library", "compare", priceId], queryFn: ({ signal }) => api<{ items: PriceItem[] }>(`/library/prices/${priceId}/compare`, { signal }), enabled: Boolean(priceId) && tab === "comparaison" });
  const history = useQuery({ queryKey: ["library", "history", priceId], queryFn: ({ signal }) => api<{ items: PriceHistoryEntry[] }>(`/library/prices/${priceId}/history`, { signal }), enabled: Boolean(priceId) && tab === "historique" });

  const verify = useMutation({
    mutationFn: (id: string) => api(`/library/prices/${id}/verify`, { body: { status: "verifie" } }),
    onSuccess: () => {
      void detail.refetch();
      onChanged();
      toast.success("Prix marqué comme vérifié.");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const duplicate = useMutation({
    mutationFn: (id: string) => api<{ price: PriceItem }>(`/library/prices/${id}/duplicate`, { method: "POST" }),
    onSuccess: (r) => {
      onChanged();
      toast.success("Copie créée dans vos prix : adaptez-la à vos conditions.");
      onDuplicated(r.price);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const p = detail.data?.price;
  const source = detail.data?.source;
  const series = p?.series ? Object.entries(p.series).sort(([a], [b]) => Number(a) - Number(b)) : [];
  const ht = p && p.taxBasis === "TTC" ? priceExclTax(p.unitPrice, p.taxBasis, p.vatRate) : null;
  const tabs = [
    { value: "valeur", label: "Valeur et provenance" },
    ...(series.length > 1 ? [{ value: "serie", label: "Série publiée", count: series.length }] : []),
    { value: "comparaison", label: "Comparaison" },
    { value: "historique", label: "Historique" },
  ];

  return (
    <Modal
      open={priceId !== null}
      onOpenChange={onOpenChange}
      title={p?.designation ?? "Prix"}
      description={p ? `${zoneLabel(p)}${p.sourceName ? `, ${p.sourceName}` : ""}` : undefined}
      size="lg"
      footer={
        p ? (
          <>
            {p.verificationStatus !== "verifie" ? (
              <Button variant="secondary" icon={<Check className="size-4" />} loading={verify.isPending} onClick={() => verify.mutate(p.id)}>
                Marquer vérifié
              </Button>
            ) : null}
            {p.sourceId ? (
              <Button variant="secondary" icon={<Copy className="size-4" />} loading={duplicate.isPending} onClick={() => duplicate.mutate(p.id)}>
                Dupliquer pour l’adapter
              </Button>
            ) : (
              <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => onEdit(p)}>
                Modifier
              </Button>
            )}
            <Button onClick={() => onOpenChange(false)}>Fermer</Button>
          </>
        ) : undefined
      }
    >
      {detail.isPending || !p ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge>{PRICE_KIND_LABELS[p.kind]}</Badge>
            {p.priceScope ? <Badge>{PRICE_SCOPE_LABELS[p.priceScope]}</Badge> : null}
            {p.taxBasis ? <Badge tone="dark">{p.taxBasis}</Badge> : null}
            {p.reliability ? (
              <Badge tone={reliabilityTone[p.reliability]} dot>
                Fiabilité {RELIABILITY_LABELS[p.reliability].toLowerCase()}
              </Badge>
            ) : null}
            <Badge tone={p.verificationStatus === "verifie" ? "success" : p.verificationStatus === "rejete" ? "neutral" : "warning"} dot>
              {VALIDATION_STATUS_LABELS[p.verificationStatus]}
            </Badge>
          </div>
          <div className="mt-4 rounded-xl border border-line bg-surface-2 p-4">
            <p className="text-2xl font-semibold text-ink tabular">
              {formatMoney(p.unitPrice, p.currency)}
              <span className="text-sm font-normal text-ink-3">
                {" "}
                / {p.unit}
                {p.taxBasis ? ` ${p.taxBasis}` : ""}
              </span>
            </p>
            {ht !== null ? (
              <p className="mt-1 text-xs text-ink-2">
                Soit {formatMoney(ht, p.currency)} HT, la TVA de {formatNumber(p.vatRate)} % incluse dans le prix publié étant retirée. Les sous-détails utilisent ce prix hors taxes.
              </p>
            ) : null}
            {p.priceMin && p.priceMax ? (
              <p className="mt-1 text-xs text-ink-3">
                Fourchette de {formatMoney(p.priceMin, p.currency)} à {formatMoney(p.priceMax, p.currency)}
              </p>
            ) : null}
          </div>

          <Tabs value={tab} onValueChange={setTab} items={tabs} className="mt-4">
            <TabPanel value="valeur">
              <dl>
                <Row label="Période ou date">
                  {whenLabel(p)}
                  {p.period ? <span className="text-ink-3">, date de valeur {formatDate(p.priceDate)}</span> : null}
                </Row>
                {p.aggregation ? <Row label="Méthode">{p.aggregation}</Row> : null}
                {p.sampleSize ? <Row label="Observations">{formatNumber(p.sampleSize)}</Row> : null}
                <Row label="Nature de la valeur">{PRICE_VALUE_STATUS_LABELS[p.valueStatus]}</Row>
                <Row label="Zone">{zoneLabel(p)}</Row>
                {p.tradeFamily || p.subFamily ? <Row label="Famille">{[p.tradeFamily ? tradeLabel(p.tradeFamily) : null, p.subFamily].filter(Boolean).join(", ")}</Row> : null}
                <Row label="Provenance">{source ? `${source.name}, ${source.publisher}` : PRICE_ORIGIN_LABELS[p.origin]}</Row>
                {p.sourceRef ? <Row label="Référence dans la source">{p.sourceRef}</Row> : null}
                {p.sourceUrl ? (
                  <Row label="Ressource">
                    <SourceLink href={p.sourceUrl}>{p.sourceUrl.replace(/^https?:\/\//, "").slice(0, 80)}</SourceLink>
                  </Row>
                ) : null}
                {source ? (
                  <Row label="Licence">
                    {source.licenseUrl ? <SourceLink href={source.licenseUrl}>{source.license}</SourceLink> : source.license}
                  </Row>
                ) : p.license ? (
                  <Row label="Licence">{p.license}</Row>
                ) : null}
                {detail.data?.importBatch ? <Row label="Lot d’import">{`${detail.data.importBatch.label}, ${formatDateTime(detail.data.importBatch.createdAt)}`}</Row> : null}
                {p.verifiedAt ? <Row label="Dernière vérification">{formatDateTime(p.verifiedAt)}</Row> : null}
                {p.supplierName ? <Row label="Fournisseur">{p.supplierName}</Row> : null}
                {p.commercialConditions ? <Row label="Conditions commerciales">{p.commercialConditions}</Row> : null}
                {p.description ? <Row label="Description">{p.description}</Row> : null}
              </dl>
            </TabPanel>
            {series.length > 1 ? (
              <TabPanel value="serie">
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={series.map(([year, value]) => ({ year, value }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="fillSeries" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.22} />
                          <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} stroke="var(--line)" />
                      <XAxis dataKey="year" tickLine={false} axisLine={false} tick={{ fill: "var(--ink-3)", fontSize: 11 }} />
                      <YAxis width={56} tickLine={false} axisLine={false} tick={{ fill: "var(--ink-3)", fontSize: 11 }} tickFormatter={(v: number) => formatNumber(v)} domain={["auto", "auto"]} />
                      <Tooltip
                        cursor={{ stroke: "var(--line-strong)" }}
                        contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, fontSize: 12, color: "var(--ink)" }}
                        formatter={(value) => [`${formatMoney(value as number, p.currency)} / ${p.unit}`, "Prix publié"]}
                      />
                      <Area type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={1.75} fill="url(#fillSeries)" dot={false} activeDot={{ r: 4 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <ol className="mt-3 grid grid-cols-2 gap-x-6 sm:grid-cols-3">
                  {series.map(([year, value], i) => {
                    const previous = i > 0 ? series[i - 1]![1] : null;
                    const change = previous ? (value / previous - 1) * 100 : null;
                    return (
                      <li key={year} className="flex items-baseline justify-between gap-2 border-b border-line py-1.5 text-xs">
                        <span className="text-ink-3">{year}</span>
                        <span className="text-ink tabular">
                          {formatMoney(value, p.currency)}
                          {change !== null ? <span className={cn("ml-1.5 text-2xs", change > 0 ? "text-warning" : "text-success")}>{`${change > 0 ? "+" : ""}${formatNumber(change)} %`}</span> : null}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </TabPanel>
            ) : null}
            <TabPanel value="comparaison">
              <Comparison price={p} items={compare.data?.items} loading={compare.isPending} />
            </TabPanel>
            <TabPanel value="historique">
              {history.isPending ? (
                <Skeleton className="h-24" />
              ) : (history.data?.items ?? []).length === 0 ? (
                <EmptyState title="Aucune valeur enregistrée" />
              ) : (
                <ol className="grid gap-2">
                  {history.data!.items.map((h, i) => (
                    <li key={h.id} className={cn("flex items-start gap-3 rounded-xl border p-3", i === 0 ? "border-accent/30 bg-accent-soft" : "border-line")}>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-ink tabular">
                          {formatMoney(h.unitPrice, h.currency)}
                          <span className="font-normal text-ink-3"> / {p.unit}</span>
                        </p>
                        <p className="text-2xs text-ink-3">{[`prix du ${formatDate(h.priceDate)}`, PRICE_ORIGIN_LABELS[h.origin], h.note].filter(Boolean).join(", ")}</p>
                      </div>
                      <p className="shrink-0 text-2xs text-ink-3">{formatDateTime(h.recordedAt)}</p>
                    </li>
                  ))}
                </ol>
              )}
            </TabPanel>
          </Tabs>
        </>
      )}
    </Modal>
  );
}

/** Déclinaisons de la référence (autres zones, autres sources), avec la position du prix affiché. */
function Comparison({ price, items, loading }: { price: PriceItem; items: PriceItem[] | undefined; loading: boolean }) {
  if (loading) return <Skeleton className="h-32" />;
  const list = [...(items ?? [])].sort((a, b) => Number(a.unitPrice) - Number(b.unitPrice));
  if (list.length <= 1) return <EmptyState title="Aucune autre déclinaison" text="Aucun autre prix de même désignation et de même unité dans ce pays." />;
  const values = list.map((x) => Number(x.unitPrice));
  const mid = Math.floor(values.length / 2);
  const median = values.length % 2 ? values[mid]! : (values[mid - 1]! + values[mid]!) / 2;
  const gap = (Number(price.unitPrice) / median - 1) * 100;
  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {[
          ["Plus bas", values[0]!],
          ["Médiane", median],
          ["Plus haut", values[values.length - 1]!],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-xl border border-line p-3">
            <p className="text-2xs text-ink-3">{label}</p>
            <p className="mt-0.5 text-sm font-semibold text-ink tabular">{formatMoney(value as number, price.currency)}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink-2">
        {list.length} déclinaisons. Ce prix est {Math.abs(gap) < 0.5 ? "au niveau de la médiane" : `${formatNumber(Math.abs(gap))} % ${gap > 0 ? "au-dessus" : "en dessous"} de la médiane`}. Des prix TTC et HT, ou de dates différentes, ne se comparent qu’avec prudence.
      </p>
      <ol className="mt-3 max-h-72 overflow-y-auto overscroll-contain rounded-xl border border-line">
        {list.map((x) => (
          <li key={x.id} className={cn("flex items-center gap-3 border-b border-line px-3 py-2 text-xs last:border-b-0", x.id === price.id && "bg-accent-soft")}>
            <div className="min-w-0 flex-1">
              <p className="truncate text-ink">{zoneLabel(x)}</p>
              <p className="truncate text-2xs text-ink-3">{[whenLabel(x), x.sourceName ?? PRICE_ORIGIN_LABELS[x.origin]].filter(Boolean).join(", ")}</p>
            </div>
            <p className="shrink-0 font-semibold text-ink tabular">
              {formatMoney(x.unitPrice, x.currency)}
              {x.taxBasis ? <span className="ml-1 text-2xs font-normal text-ink-3">{x.taxBasis}</span> : null}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
