import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Archive, ArchiveRestore, CircleAlert, CircleCheck, Copy, FileSpreadsheet, FileText, FileType2, FolderPlus, Library, ListPlus, Moon, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { MARGIN_MODE_LABELS, MARGIN_MODES, QUOTE_EVENT_LABELS, QUOTE_STATUS_LABELS, RATE_BASE_LABELS, RATE_BASES, TAX_REGIME_LABELS, TAX_REGIMES, type QuoteLineKind } from "../../../shared/enums";
import { JobProgress } from "../../components/JobProgress";
import { type DownloadGroup, DownloadMenu } from "../../components/DownloadMenu";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card, CardHeader } from "../../components/ui/Card";
import { ConfirmDialog } from "../../components/ui/Dialog";
import { EmptyState, InlineError, Skeleton } from "../../components/ui/Feedback";
import { Field, SelectField, TextareaField } from "../../components/ui/Field";
import { ActionMenu } from "../../components/ui/Menu";
import { PageHeader } from "../../components/ui/PageHeader";
import { TabPanel, Tabs } from "../../components/ui/Tabs";
import { api, ApiError, query } from "../../lib/api";
import { cn } from "../../lib/cn";
import { formatDate, formatDateTime, formatMoney, formatNumber } from "../../lib/format";
import { isActive, type Job } from "../../lib/jobs";
import { quoteActions, type QuoteActionKey, quoteError, quoteStatusTone, rateLabel, unitLabel } from "../../lib/quotes";
import type { Client, CompanyProfile, Paged, QuoteDetail, QuoteLine } from "../../lib/types";
import { PricePickerDialog } from "./PricePickerDialog";
import { QuoteLineDialog } from "./QuoteLineDialog";

const KEY = (id: string) => ["quotes", id] as const;

/** Lignes dans l'ordre du devis, avec leur profondeur et leur numéro. */
function ordered(lines: QuoteLine[]): Array<{ line: QuoteLine; depth: number; code: string }> {
  const children = (parent: string | null) => lines.filter((l) => (l.parentId ?? null) === parent && (parent === null || lines.some((p) => p.id === parent))).sort((a, b) => a.position - b.position);
  const roots = lines.filter((l) => !l.parentId || !lines.some((p) => p.id === l.parentId)).sort((a, b) => a.position - b.position);
  const out: Array<{ line: QuoteLine; depth: number; code: string }> = [];
  let option = 0;
  const walk = (list: QuoteLine[], prefix: string, depth: number) => {
    let n = 0;
    for (const line of list) {
      if (line.kind === "option") {
        option++;
        out.push({ line, depth, code: `Option ${option}` });
        continue;
      }
      n++;
      const code = prefix ? `${prefix}.${n}` : String(n);
      out.push({ line, depth, code });
      if (line.kind === "section") walk(children(line.id), code, depth + 1);
    }
  };
  walk(roots, "", 0);
  return out;
}

/** Raison pour laquelle un prix est incertain (mêmes règles que le serveur). */
function uncertainty(line: QuoteLine): string | null {
  const s = line.priceSnapshot;
  if (!s || line.priceConfirmed) return null;
  if (s.regulated) return "Salaire minimal brut, hors charges";
  if (s.historical) return "Prix historique";
  if (s.verificationStatus !== "verifie") return "Prix à vérifier";
  if (s.reliability === "faible") return "Fiabilité faible";
  return null;
}

export function QuoteDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("devis");
  const [editing, setEditing] = useState<{ kind: QuoteLineKind; line: QuoteLine | null; parentId: string | null } | null>(null);
  const [picking, setPicking] = useState<{ parentId: string | null } | null>(null);
  const [deleting, setDeleting] = useState<QuoteLine | null>(null);
  const detail = useQuery({ queryKey: KEY(id), queryFn: ({ signal }) => api<QuoteDetail>(`/quotes/${id}`, { signal }) });
  const data = detail.data;
  const jobId = data?.quote.generationJobId ?? null;
  const job = useQuery({
    queryKey: ["jobs", "un", jobId],
    queryFn: ({ signal }) => api<{ job: Job }>(`/agents/jobs/${jobId}`, { signal }),
    enabled: Boolean(jobId),
    refetchInterval: (q) => (q.state.data && isActive(q.state.data.job) ? 2500 : false),
  });
  const jobRow = job.data?.job;
  const jobRunning = jobRow ? isActive(jobRow) : false;
  useEffect(() => {
    if (jobRow && !isActive(jobRow)) void queryClient.invalidateQueries({ queryKey: KEY(id) });
  }, [jobRow?.status, id, queryClient, jobRow]);

  const apply = (next: QuoteDetail) => queryClient.setQueryData(KEY(id), next);
  const action = useMutation({
    mutationFn: (key: QuoteActionKey | "archiver" | "restaurer") => api<QuoteDetail>(`/quotes/${id}/${key}`, { body: {} }),
    onSuccess: (next, key) => {
      apply(next);
      void queryClient.invalidateQueries({ queryKey: ["quotes"], exact: false });
      toast.success(key === "archiver" ? "Devis archivé." : key === "restaurer" ? "Devis restauré." : `Statut : ${QUOTE_STATUS_LABELS[next.quote.status]}.`);
    },
    onError: (e) => toast.error(quoteError(e), { duration: 8000 }),
  });
  const duplicate = useMutation({
    mutationFn: () => api<{ quote: { id: string; number: string } }>(`/quotes/${id}/dupliquer`, { body: {} }),
    onSuccess: (res) => {
      toast.success(`Copie créée : devis ${res.quote.number}.`);
      navigate(`/administration/devis/${res.quote.id}`);
    },
    onError: (e) => toast.error(quoteError(e)),
  });
  const lineMutation = useMutation({
    mutationFn: ({ line, kind, body }: { line: QuoteLine; kind: "delete" | "move" | "confirm"; body?: unknown }) =>
      kind === "delete"
        ? api<QuoteDetail>(`/quote-lines/${line.id}`, { method: "DELETE" })
        : kind === "move"
          ? api<QuoteDetail>(`/quote-lines/${line.id}/deplacer`, { body })
          : api<QuoteDetail>(`/quote-lines/${line.id}`, { method: "PATCH", body: { priceConfirmed: true } }),
    onSuccess: (next, vars) => {
      apply(next);
      if (vars.kind === "delete") toast.success("Ligne supprimée.");
      if (vars.kind === "confirm") toast.success("Prix confirmé.");
      setDeleting(null);
    },
    onError: (e) => toast.error(quoteError(e)),
  });
  const addPrices = useMutation({
    mutationFn: (ids: string[]) => api<QuoteDetail>(`/quotes/${id}/lines/library`, { body: { priceItemIds: ids, parentId: picking?.parentId ?? null } }),
    onSuccess: (next, ids) => {
      apply(next);
      setPicking(null);
      toast.success(`${ids.length} prix ajouté(s).`);
    },
    onError: (e) => toast.error(quoteError(e)),
  });

  if (detail.isPending) return <Skeleton className="mx-auto h-96 max-w-7xl" />;
  if (!data) return <EmptyState title="Devis introuvable" text="Il a peut-être été supprimé." action={<Button onClick={() => navigate("/administration/devis")}>Retour aux devis</Button>} />;
  const q = data.quote;
  const editable = (q.status === "brouillon" || q.status === "a_verifier" || q.status === "valide") && !q.lockedAt && !q.archivedAt;
  const rows = ordered(data.lines);
  const blocking = data.checks.filter((c) => c.severity !== "mineure").length;
  const downloads: DownloadGroup[] = [
    {
      items: [
        { label: "Télécharger en PDF", href: `/api/admin/quotes/${id}/export/pdf`, icon: <FileType2 /> },
        { label: "Télécharger en Excel", href: `/api/admin/quotes/${id}/export/xlsx`, icon: <FileSpreadsheet /> },
        { label: "Télécharger en Word", href: `/api/admin/quotes/${id}/export/docx`, icon: <FileText /> },
      ],
    },
    { title: "Version sombre, pour présentation", items: [{ label: "PDF, version sombre", href: `/api/admin/quotes/${id}/export/pdf?theme=sombre`, icon: <Moon /> }] },
  ];
  const actions = quoteActions(q.status);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        back={{ to: "/administration/devis", label: "Devis" }}
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={quoteStatusTone[q.status]} dot>
              {QUOTE_STATUS_LABELS[q.status]}
            </Badge>
            {q.currentVersion ? <span>{`Version ${q.currentVersion}${q.lockedAt ? " envoyée" : ""}`}</span> : null}
            {q.archivedAt ? <Badge>Archivé</Badge> : null}
          </span>
        }
        title={`Devis ${q.number}`}
        description={[q.title, data.client?.name, data.project ? (data.project.name === q.title ? data.project.reference : `${data.project.reference}, ${data.project.name}`) : null].filter(Boolean).join(", ")}
        actions={
          <>
            {!q.archivedAt
              ? actions.map((a, i) => (
                  <Button key={a.key} size="sm" variant={i === 0 ? "primary" : "secondary"} loading={action.isPending && action.variables === a.key} disabled={jobRunning} onClick={() => action.mutate(a.key)}>
                    {a.label}
                  </Button>
                ))
              : null}
            <DownloadMenu groups={downloads} />
            <ActionMenu
              actions={[
                { label: "Dupliquer", icon: <Copy />, onSelect: () => duplicate.mutate() },
                q.archivedAt ? { label: "Restaurer", icon: <ArchiveRestore />, onSelect: () => action.mutate("restaurer") } : { label: "Archiver", icon: <Archive />, onSelect: () => action.mutate("archiver") },
              ]}
            />
          </>
        }
      />

      {jobRow && (jobRunning || jobRow.status === "echoue") ? (
        <div className="mb-4">
          <JobProgress job={jobRow} defaultOpen />
        </div>
      ) : null}
      {q.lockedAt ? (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3 text-xs text-ink-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden="true" />
          <p>{`Version ${q.currentVersion} envoyée le ${formatDate(q.sentAt)} : le devis est verrouillé. Pour le modifier, préparez une nouvelle version ; la version envoyée reste téléchargeable dans l’onglet Versions.`}</p>
        </div>
      ) : null}

      <Tabs
        value={tab}
        onValueChange={setTab}
        items={[
          { value: "devis", label: "Devis" },
          { value: "historique", label: "Historique", count: data.events.length },
          { value: "versions", label: "Versions", count: data.versions.length },
        ]}
      >
        <TabPanel value="devis">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="grid min-w-0 gap-4 lg:col-start-1 lg:row-start-1">
              <Card className="overflow-hidden">
                <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
                  <CardHeader title="Prestations" subtitle={`${data.lines.filter((l) => l.kind === "ligne").length} ligne(s), montants calculés par le serveur`} />
                  {editable ? (
                    <div className="flex shrink-0 flex-wrap gap-1.5">
                      <Button size="sm" variant="secondary" icon={<FolderPlus className="size-3.5" />} onClick={() => setEditing({ kind: "section", line: null, parentId: null })}>
                        Section
                      </Button>
                      <Button size="sm" variant="secondary" icon={<Library className="size-3.5" />} onClick={() => setPicking({ parentId: null })}>
                        Bibliothèque
                      </Button>
                      <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setEditing({ kind: "ligne", line: null, parentId: null })}>
                        Ligne
                      </Button>
                    </div>
                  ) : null}
                </div>
                {rows.length === 0 ? (
                  <div className="border-t border-line p-6">
                    <EmptyState
                      title={jobRunning ? "Préparation en cours" : "Aucune ligne"}
                      text={jobRunning ? "L’IA prépare les postes ; ils apparaîtront ici à la fin du traitement." : "Ajoutez une section, une ligne ou des prix de la bibliothèque."}
                    />
                  </div>
                ) : (
                  <ul className="divide-y divide-line border-t border-line">
                    {rows.map(({ line, depth, code }) => (
                      <LineRow
                        key={line.id}
                        line={line}
                        depth={depth}
                        code={code}
                        detail={data}
                        editable={editable}
                        onEdit={() => setEditing({ kind: line.kind, line, parentId: line.parentId })}
                        onAddInside={() => setEditing({ kind: "ligne", line: null, parentId: line.id })}
                        onAddPrices={() => setPicking({ parentId: line.id })}
                        onMove={(direction) => lineMutation.mutate({ line, kind: "move", body: { direction } })}
                        onConfirm={() => lineMutation.mutate({ line, kind: "confirm" })}
                        onDelete={() => setDeleting(line)}
                      />
                    ))}
                  </ul>
                )}
                {editable ? (
                  <div className="border-t border-line px-4 py-3 sm:px-5">
                    <Button size="sm" variant="ghost" icon={<ListPlus className="size-3.5" />} onClick={() => setEditing({ kind: "option", line: null, parentId: null })}>
                      Ajouter une option, hors total
                    </Button>
                  </div>
                ) : null}
              </Card>
            </div>
            <div className="min-w-0 lg:col-start-1 lg:row-start-2">
              <HeaderCard detail={data} editable={editable} onSaved={apply} />
            </div>
            <div className="grid content-start gap-4 lg:sticky lg:top-4 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
              <TotalsCard detail={data} />
              <Card className="p-4 sm:p-5">
                <CardHeader title="Contrôles" subtitle={blocking ? `${blocking} point(s) à régler avant l’envoi` : "Aucun point bloquant"} />
                {data.checks.length === 0 ? (
                  <p className="mt-3 flex items-center gap-2 text-xs text-success">
                    <CircleCheck className="size-4" aria-hidden="true" />
                    Devis complet et cohérent.
                  </p>
                ) : (
                  <ul className="mt-3 grid gap-2">
                    {data.checks.map((c, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs">
                        <CircleAlert className={cn("mt-0.5 size-3.5 shrink-0", c.severity === "bloquante" ? "text-danger" : c.severity === "majeure" ? "text-warning" : "text-ink-3")} aria-hidden="true" />
                        <span className="min-w-0 text-ink-2">{c.message}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        </TabPanel>
        <TabPanel value="historique">
          <Card className="overflow-hidden">
            <ul className="divide-y divide-line">
              {data.events.map((e) => (
                <li key={e.id} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-4 sm:px-5">
                  <span className="w-40 shrink-0 text-2xs text-ink-3 tabular">{formatDateTime(e.occurredAt)}</span>
                  <span className="text-xs font-semibold text-ink">{QUOTE_EVENT_LABELS[e.kind]}</span>
                  {e.note ? <span className="min-w-0 text-xs text-ink-2">{e.note}</span> : null}
                </li>
              ))}
            </ul>
          </Card>
        </TabPanel>
        <TabPanel value="versions">
          <Card className="overflow-hidden">
            {data.versions.length === 0 ? (
              <div className="p-6">
                <EmptyState title="Aucune version envoyée" text="Chaque envoi fige le devis tel qu’il est : il reste téléchargeable ici, même après une nouvelle version." />
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {data.versions.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-ink">{v.label}</p>
                      <p className="text-2xs text-ink-3">{QUOTE_STATUS_LABELS[v.status]}</p>
                    </div>
                    <DownloadMenu
                      groups={[
                        {
                          items: (["pdf", "xlsx", "docx"] as const).map((f) => ({ label: `Version ${v.version}, ${f === "pdf" ? "PDF" : f === "xlsx" ? "Excel" : "Word"}`, href: `/api/admin/quotes/${id}/versions/${v.id}/export/${f}`, icon: f === "pdf" ? <FileType2 /> : f === "xlsx" ? <FileSpreadsheet /> : <FileText /> })),
                        },
                      ]}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </TabPanel>
      </Tabs>

      {editing ? <QuoteLineDialog quote={data} open kind={editing.kind} line={editing.line} defaultParentId={editing.parentId} onOpenChange={(open) => !open && setEditing(null)} onSaved={apply} /> : null}
      <PricePickerDialog open={picking !== null} onOpenChange={(open) => !open && setPicking(null)} currency={q.currency} busy={addPrices.isPending} onPick={(ids) => addPrices.mutate(ids)} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={deleting?.kind === "section" ? "Supprimer la section et ses lignes ?" : "Supprimer la ligne ?"}
        text={deleting ? `« ${deleting.designation} » sera retirée du devis.` : ""}
        confirmLabel="Supprimer"
        tone="danger"
        onConfirm={() => (deleting ? lineMutation.mutateAsync({ line: deleting, kind: "delete" }) : undefined)}
      />
    </div>
  );
}

function LineRow({
  line,
  depth,
  code,
  detail,
  editable,
  onEdit,
  onAddInside,
  onAddPrices,
  onMove,
  onConfirm,
  onDelete,
}: {
  line: QuoteLine;
  depth: number;
  code: string;
  detail: QuoteDetail;
  editable: boolean;
  onEdit: () => void;
  onAddInside: () => void;
  onAddPrices: () => void;
  onMove: (direction: "haut" | "bas") => void;
  onConfirm: () => void;
  onDelete: () => void;
}) {
  const currency = detail.quote.currency;
  const f = detail.totals.lines[line.id];
  const indent = { paddingLeft: `${1 + depth * 1.25}rem` };
  const menu = editable
    ? [
        { label: "Modifier", icon: <Pencil />, onSelect: onEdit },
        ...(line.kind === "section"
          ? [
              { label: "Ajouter une ligne dans la section", icon: <Plus />, onSelect: onAddInside },
              { label: "Ajouter des prix de la bibliothèque", icon: <Library />, onSelect: onAddPrices },
            ]
          : []),
        ...(uncertainty(line) ? [{ label: "Confirmer ce prix", icon: <CircleCheck />, onSelect: onConfirm }] : []),
        { label: "Monter", icon: <ArrowUp />, onSelect: () => onMove("haut") },
        { label: "Descendre", icon: <ArrowDown />, onSelect: () => onMove("bas") },
        { label: "Supprimer", icon: <Trash2 />, tone: "danger" as const, onSelect: onDelete },
      ]
    : [];
  if (line.kind === "section") {
    const sub = detail.totals.sections[line.id];
    return (
      <li className="flex items-center gap-3 bg-surface-2/60 py-2.5 pr-4 sm:pr-5" style={indent}>
        <span className="w-12 shrink-0 text-xs font-semibold text-ink-3 tabular">{code}</span>
        <p className="min-w-0 flex-1 text-xs font-semibold text-ink">{line.designation}</p>
        {sub && sub.count ? <span className="text-xs font-semibold text-ink tabular">{`${sub.complete ? "" : "partiel, "}${formatMoney(sub.total, currency)}`}</span> : <span className="text-2xs text-ink-3">Section vide</span>}
        {menu.length ? <ActionMenu actions={menu} /> : null}
      </li>
    );
  }
  const reason = uncertainty(line);
  const qtyDoubt = /Métré : (\d+) mesure\(s\), dont (\d+) vérifiée\(s\)/.exec(line.quantitySource ?? "");
  return (
    <li className="flex items-start gap-3 py-3 pr-4 sm:pr-5" style={indent}>
      <span className="w-12 shrink-0 pt-0.5 text-xs text-ink-3 tabular">{code}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-ink">{line.designation}</p>
        {line.description ? <p className="mt-0.5 text-2xs whitespace-pre-line text-ink-3">{line.description}</p> : null}
        <p className="mt-1 text-2xs text-ink-3">
          {[
            line.quantity !== null ? `${formatNumber(line.quantity)} ${unitLabel(line.unit)}` : "Quantité à préciser",
            f?.unitPrice ? `${formatMoney(f.unitPrice, currency)} HT l’unité` : "Prix à établir",
            line.discountRate ? `remise ${rateLabel(line.discountRate)}` : null,
            detail.quote.taxRegime === "normal" && f?.vatRate ? `TVA ${rateLabel(f.vatRate)}` : null,
            line.pricingMode === "decompose" ? "fourniture et pose" : null,
          ]
            .filter(Boolean)
            .join(", ")}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {line.kind === "option" ? <Badge>Option, hors total</Badge> : null}
          {f?.unitPrice === null ? <Badge tone="danger">Prix à établir</Badge> : null}
          {reason ? <Badge tone="warning">{reason}</Badge> : null}
          {qtyDoubt && Number(qtyDoubt[2]) < Number(qtyDoubt[1]) && !line.priceConfirmed ? <Badge tone="warning">Quantité du métré à vérifier</Badge> : null}
          {line.priceOrigin ? <span className="text-2xs text-ink-3">{line.priceOrigin}</span> : null}
          {line.quantitySource && line.quantitySource !== "À préciser" ? <span className="text-2xs text-ink-3">{`Quantité : ${line.quantitySource}`}</span> : null}
        </div>
      </div>
      <span className="shrink-0 pt-0.5 text-right text-xs font-semibold text-ink tabular">{f?.net ? formatMoney(f.net, currency) : <span className="text-accent">à établir</span>}</span>
      {menu.length ? <ActionMenu actions={menu} /> : null}
    </li>
  );
}

function TotalsCard({ detail }: { detail: QuoteDetail }) {
  const t = detail.totals;
  const q = detail.quote;
  const c = q.currency;
  const row = (label: string, value: string, strong = false) => (
    <div className={cn("flex items-baseline justify-between gap-3 py-1.5 text-xs", strong ? "font-semibold text-ink" : "text-ink-2")}>
      <span>{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
  const missing = t.missing.prices + t.missing.quantities;
  return (
    <Card className="p-4 sm:p-5">
      <CardHeader title="Montant du devis" subtitle={t.state === "complet" ? "Tous les montants sont connus" : t.state === "partiel" ? `Totaux partiels, ${missing} ligne(s) à compléter` : "Aucun montant calculable"} />
      <div className="mt-3 divide-y divide-line">
        {Number(t.globalDiscount) > 0 ? row("Total des lignes HT", formatMoney(t.linesTotal, c)) : null}
        {Number(t.globalDiscount) > 0 ? row(`Remise globale ${rateLabel(q.discountRate)}`, `− ${formatMoney(t.globalDiscount, c)}`) : null}
        {row(t.state === "complet" ? "Total HT" : "Total partiel HT", t.state === "non_renseigne" ? "à établir" : formatMoney(t.totalHt, c), true)}
        {q.taxRegime === "normal"
          ? t.totalVat !== null
            ? t.vat.map((v) => <div key={v.rate}>{row(`TVA ${rateLabel(v.rate)} sur ${formatMoney(v.base, c)}`, formatMoney(v.amount, c))}</div>)
            : row("TVA", t.missing.vatRates ? "taux à préciser" : "à établir")
          : row(TAX_REGIME_LABELS[q.taxRegime], "TVA non facturée")}
        {row("Total TTC", t.totalTtc !== null ? formatMoney(t.totalTtc, c) : "à établir", true)}
        {t.deposit !== null ? row(q.depositRate ? `Acompte ${rateLabel(q.depositRate)}` : "Acompte", formatMoney(t.deposit, c)) : null}
        {t.options && Number(t.options) > 0 ? row("Options, hors total", formatMoney(t.options, c)) : null}
      </div>
    </Card>
  );
}

interface HeaderValues {
  title: string;
  clientId: string;
  companyProfileId: string;
  siteName: string;
  siteAddress: string;
  issueDate: string;
  validityDays: string;
  taxRegime: string;
  vatRate: string;
  taxExemptionBasis: string;
  discountRate: string;
  depositRate: string;
  depositAmount: string;
  siteCostsRate: string;
  overheadRate: string;
  overheadBase: string;
  contingencyRate: string;
  contingencyBase: string;
  marginRate: string;
  marginMode: string;
  paymentTerms: string;
  notes: string;
  legalMentions: string;
}

const num = (v: string | null) => (v === null ? "" : String(Number(v)));

function valuesOf(d: QuoteDetail): HeaderValues {
  const q = d.quote;
  return {
    title: q.title,
    clientId: q.clientId ?? "",
    companyProfileId: q.companyProfileId ?? "",
    siteName: q.siteName ?? "",
    siteAddress: q.siteAddress ?? "",
    issueDate: q.issueDate ?? "",
    validityDays: q.validityDays ? String(q.validityDays) : "",
    taxRegime: q.taxRegime,
    vatRate: num(q.vatRate),
    taxExemptionBasis: q.taxExemptionBasis ?? "",
    discountRate: num(q.discountRate),
    depositRate: num(q.depositRate),
    depositAmount: num(q.depositAmount),
    siteCostsRate: num(q.siteCostsRate),
    overheadRate: num(q.overheadRate),
    overheadBase: q.overheadBase,
    contingencyRate: num(q.contingencyRate),
    contingencyBase: q.contingencyBase,
    marginRate: num(q.marginRate),
    marginMode: q.marginMode,
    paymentTerms: q.paymentTerms ?? "",
    notes: q.notes ?? "",
    legalMentions: q.legalMentions ?? "",
  };
}

/** En-tête du devis : client, chantier, validité, TVA, remise, acompte, coefficients, conditions et mentions. */
function HeaderCard({ detail, editable, onSaved }: { detail: QuoteDetail; editable: boolean; onSaved: (d: QuoteDetail) => void }) {
  const [values, setValues] = useState<HeaderValues>(valuesOf(detail));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  useEffect(() => setValues(valuesOf(detail)), [detail]);
  const clients = useQuery({ queryKey: ["clients", "choix"], queryFn: ({ signal }) => api<Paged<Client>>(`/clients${query({ pageSize: 100 })}`, { signal }) });
  const companies = useQuery({ queryKey: ["company", "profiles"], queryFn: ({ signal }) => api<{ items: CompanyProfile[] }>("/company/profiles", { signal }) });
  const set = (key: keyof HeaderValues, value: string) => setValues((v) => ({ ...v, [key]: value }));
  const dirty = JSON.stringify(values) !== JSON.stringify(valuesOf(detail));
  const save = useMutation({
    mutationFn: () => api<QuoteDetail>(`/quotes/${detail.quote.id}`, { method: "PATCH", body: values }),
    onSuccess: (next) => {
      setErrors({});
      setGeneral(null);
      onSaved(next);
      toast.success("Devis enregistré.");
    },
    onError: (e) => {
      if (e instanceof ApiError && Object.keys(e.fields).length) setErrors(e.fields);
      setGeneral(quoteError(e));
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };
  const disabled = !editable;
  return (
    <Card className="p-4 sm:p-5">
      <form onSubmit={submit}>
        <CardHeader
          title="En-tête, conditions et TVA"
          subtitle="Informations reprises de l’affaire et de l’entité émettrice, modifiables"
          action={
            editable ? (
              <Button type="submit" size="sm" disabled={!dirty} loading={save.isPending}>
                Enregistrer
              </Button>
            ) : null
          }
        />
        {general ? (
          <div className="mt-3">
            <InlineError>{general}</InlineError>
          </div>
        ) : null}
        <fieldset disabled={disabled} className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Objet" value={values.title} onChange={(e) => set("title", e.target.value)} error={errors.title} className="sm:col-span-2" />
          <SelectField label="Client" optional placeholder="Aucun" options={(clients.data?.items ?? []).map((c) => ({ value: c.id, label: c.name }))} value={values.clientId} onChange={(e) => set("clientId", e.target.value)} error={errors.clientId} />
          <SelectField label="Entité émettrice" optional placeholder="Aucune" options={(companies.data?.items ?? []).map((c) => ({ value: c.id, label: c.label }))} value={values.companyProfileId} onChange={(e) => set("companyProfileId", e.target.value)} />
          <Field label="Chantier" optional value={values.siteName} onChange={(e) => set("siteName", e.target.value)} />
          <Field label="Adresse du chantier" optional value={values.siteAddress} onChange={(e) => set("siteAddress", e.target.value)} />
          <Field label="Date d’émission" optional type="date" value={values.issueDate} onChange={(e) => set("issueDate", e.target.value)} hint="Fixée à l’envoi si elle est vide." />
          <Field label="Validité, en jours" inputMode="numeric" value={values.validityDays} onChange={(e) => set("validityDays", e.target.value)} error={errors.validityDays} />
          <SelectField label="Régime de TVA" options={TAX_REGIMES.map((r) => ({ value: r, label: TAX_REGIME_LABELS[r] }))} value={values.taxRegime} onChange={(e) => set("taxRegime", e.target.value)} />
          {values.taxRegime === "normal" ? (
            <Field label="Taux de TVA du devis, %" inputMode="decimal" placeholder="À préciser" value={values.vatRate} onChange={(e) => set("vatRate", e.target.value)} error={errors.vatRate} hint="Un taux différent se saisit ligne par ligne." />
          ) : values.taxRegime === "exoneration" ? (
            <Field label="Fondement légal de l’exonération" value={values.taxExemptionBasis} onChange={(e) => set("taxExemptionBasis", e.target.value)} error={errors.taxExemptionBasis} />
          ) : (
            <p className="self-end text-2xs text-ink-3">Mention légale imprimée automatiquement sur le devis.</p>
          )}
          <Field label="Remise globale, %" optional inputMode="decimal" value={values.discountRate} onChange={(e) => set("discountRate", e.target.value)} error={errors.discountRate} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Acompte, % du TTC" optional inputMode="decimal" value={values.depositRate} onChange={(e) => set("depositRate", e.target.value)} error={errors.depositRate} />
            <Field label="ou montant" optional inputMode="decimal" value={values.depositAmount} onChange={(e) => set("depositAmount", e.target.value)} error={errors.depositAmount} />
          </div>
          <details className="rounded-xl border border-line px-3 py-2 sm:col-span-2">
            <summary className="cursor-pointer text-xs font-semibold text-ink-2">Coefficients des lignes décomposées en fourniture et pose</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Frais de chantier, % du déboursé sec" optional inputMode="decimal" value={values.siteCostsRate} onChange={(e) => set("siteCostsRate", e.target.value)} error={errors.siteCostsRate} />
              <div />
              <Field label="Frais généraux, %" optional inputMode="decimal" value={values.overheadRate} onChange={(e) => set("overheadRate", e.target.value)} error={errors.overheadRate} />
              <SelectField label="Base des frais généraux" options={RATE_BASES.map((b) => ({ value: b, label: RATE_BASE_LABELS[b] }))} value={values.overheadBase} onChange={(e) => set("overheadBase", e.target.value)} />
              <Field label="Aléas, %" optional inputMode="decimal" value={values.contingencyRate} onChange={(e) => set("contingencyRate", e.target.value)} error={errors.contingencyRate} />
              <SelectField label="Base des aléas" options={RATE_BASES.map((b) => ({ value: b, label: RATE_BASE_LABELS[b] }))} value={values.contingencyBase} onChange={(e) => set("contingencyBase", e.target.value)} />
              <Field label="Marge" optional inputMode="decimal" value={values.marginRate} onChange={(e) => set("marginRate", e.target.value)} error={errors.marginRate} />
              <SelectField label="Mode de marge" options={MARGIN_MODES.map((m) => ({ value: m, label: MARGIN_MODE_LABELS[m] }))} value={values.marginMode} onChange={(e) => set("marginMode", e.target.value)} />
            </div>
          </details>
          <TextareaField label="Conditions de règlement" optional rows={3} value={values.paymentTerms} onChange={(e) => set("paymentTerms", e.target.value)} className="sm:col-span-2" />
          <TextareaField label="Notes imprimées" optional rows={2} value={values.notes} onChange={(e) => set("notes", e.target.value)} className="sm:col-span-2" />
          <TextareaField label="Mentions légales" optional rows={3} value={values.legalMentions} onChange={(e) => set("legalMentions", e.target.value)} className="sm:col-span-2" hint="Reprises de l’entité émettrice ; la mention propre au régime de TVA est ajoutée automatiquement." />
        </fieldset>
        {detail.project ? (
          <p className="mt-4 text-2xs text-ink-3">
            {"Affaire : "}
            <Link to={`/administration/affaires/${detail.project.id}`} className="font-semibold text-ink-2 hover:text-accent">
              {`${detail.project.reference}, ${detail.project.name}`}
            </Link>
          </p>
        ) : null}
      </form>
    </Card>
  );
}
