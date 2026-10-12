import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { FileText, Plus, Sparkles } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { QUOTE_SOURCE_LABELS, QUOTE_STATUS_LABELS, QUOTE_STATUSES } from "../../../shared/enums";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { DataTable, Pagination } from "../../components/ui/DataTable";
import { EmptyState } from "../../components/ui/Feedback";
import { PageHeader } from "../../components/ui/PageHeader";
import { SearchInput } from "../../components/ui/SearchInput";
import { Segmented } from "../../components/ui/Segmented";
import { api, query } from "../../lib/api";
import { formatDate, formatMoney } from "../../lib/format";
import { useListParams } from "../../lib/list-params";
import { quoteStatusTone } from "../../lib/quotes";
import type { Paged, QuoteListItem } from "../../lib/types";
import { AiQuoteDialog } from "./AiQuoteDialog";
import { NewQuoteDialog } from "./NewQuoteDialog";

const PAGE_SIZE = 25;
const col = createColumnHelper<QuoteListItem>();

function amount(item: QuoteListItem) {
  if (item.totalTtc !== null) return { main: formatMoney(item.totalTtc, item.currency), sub: "TTC" };
  if (item.totalHt !== null) return { main: formatMoney(item.totalHt, item.currency), sub: item.totalsState === "partiel" ? "HT, partiel" : "HT" };
  return { main: "à établir", sub: null };
}

export function QuotesPage() {
  const navigate = useNavigate();
  const list = useListParams({ id: "recent", desc: true });
  const q = list.get("q");
  const status = list.get("statut");
  const archived = list.get("archives") === "1";
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);

  const quotes = useQuery({
    queryKey: ["quotes", { q, status, archived, page: list.page }],
    queryFn: ({ signal }) => api<Paged<QuoteListItem>>(`/quotes${query({ q, statut: status, archives: archived, page: list.page, pageSize: PAGE_SIZE })}`, { signal }),
    placeholderData: keepPreviousData,
  });

  const columns = [
    col.accessor("number", {
      header: "Devis",
      enableSorting: false,
      cell: (info) => (
        <div className="min-w-0">
          <Link to={`/administration/devis/${info.row.original.id}`} className="font-semibold text-ink tabular hover:text-accent">
            {info.getValue()}
          </Link>
          <p className="truncate text-2xs text-ink-3">{info.row.original.title}</p>
        </div>
      ),
    }),
    col.accessor("clientName", {
      header: "Client et affaire",
      enableSorting: false,
      cell: (info) => (
        <div className="min-w-0 text-ink-2">
          <p className="truncate">{info.getValue() ?? "Client à renseigner"}</p>
          <p className="truncate text-2xs text-ink-3">{info.row.original.projectReference ?? QUOTE_SOURCE_LABELS[info.row.original.source]}</p>
        </div>
      ),
    }),
    col.accessor("status", {
      header: "Statut",
      enableSorting: false,
      cell: (info) => (
        <Badge tone={quoteStatusTone[info.getValue()]} dot>
          {QUOTE_STATUS_LABELS[info.getValue()]}
        </Badge>
      ),
    }),
    col.accessor("issueDate", { header: "Date", enableSorting: false, cell: (info) => <span className="text-ink-2">{info.getValue() ? formatDate(info.getValue()) : "Non émis"}</span> }),
    col.display({
      id: "montant",
      header: "Montant",
      meta: { align: "right" },
      cell: (info) => {
        const a = amount(info.row.original);
        return (
          <div className="text-right">
            <p className="font-semibold text-ink tabular">{a.main}</p>
            {a.sub ? <p className="text-2xs text-ink-3">{a.sub}</p> : null}
          </div>
        );
      },
    }),
  ];

  const data = quotes.data;
  const filtered = Boolean(q || status);
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Devis"
        description="Devis vierges ou tirés d’une affaire, d’une DPGF, du métré ou de la bibliothèque de prix. Montants calculés par le serveur, versions envoyées conservées."
        actions={
          <>
            <Button variant="secondary" icon={<Sparkles className="size-4" aria-hidden="true" />} onClick={() => setGenerating(true)}>
              Générer mon devis avec l’IA
            </Button>
            <Button icon={<Plus className="size-4" aria-hidden="true" />} onClick={() => setCreating(true)}>
              Nouveau devis
            </Button>
          </>
        }
      />
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <SearchInput value={q} onChange={(v) => list.set({ q: v })} placeholder="Numéro, objet, client, affaire" label="Rechercher un devis" className="sm:w-80" />
            <label className="relative">
              <span className="sr-only">Statut</span>
              <select
                value={status}
                onChange={(e) => list.set({ statut: e.target.value || null })}
                className="h-9 w-full appearance-none rounded-xl border border-line-strong bg-surface pr-8 pl-3 text-xs text-ink outline-none focus:border-accent sm:w-auto"
              >
                <option value="">Tous statuts</option>
                {QUOTE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {QUOTE_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Segmented
            value={archived ? "archives" : "actifs"}
            onChange={(v) => list.set({ archives: v === "archives" ? "1" : null })}
            options={[
              { value: "actifs", label: "En cours" },
              { value: "archives", label: "Archivés" },
            ]}
            label="Afficher"
          />
        </div>
        <DataTable
          label="Devis"
          columns={columns}
          data={data?.items}
          loading={quotes.isPending}
          getRowId={(item) => item.id}
          onRowClick={(item) => navigate(`/administration/devis/${item.id}`)}
          minWidth="52rem"
          empty={
            <EmptyState
              icon={<FileText className="size-5" />}
              title={filtered ? "Aucun devis ne correspond" : archived ? "Aucun devis archivé" : "Aucun devis pour l’instant"}
              text={filtered ? "Essayez un autre numéro, un autre client ou un autre statut." : archived ? undefined : "Créez un devis vierge, partez d’une affaire, d’une DPGF ou du métré, ou laissez l’IA le préparer."}
              action={!filtered && !archived ? <Button size="sm" onClick={() => setCreating(true)}>Créer un devis</Button> : undefined}
            />
          }
          mobileCard={(item) => {
            const a = amount(item);
            return (
              <Link to={`/administration/devis/${item.id}`} className="flex items-center gap-3 px-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink tabular">{item.number}</p>
                  <p className="truncate text-2xs text-ink-3">{[item.title, item.clientName].filter(Boolean).join(", ")}</p>
                  <Badge tone={quoteStatusTone[item.status]} dot className="mt-1.5">
                    {QUOTE_STATUS_LABELS[item.status]}
                  </Badge>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs font-semibold text-ink tabular">{a.main}</p>
                  {a.sub ? <p className="text-2xs text-ink-3">{a.sub}</p> : null}
                </div>
              </Link>
            );
          }}
        />
        {data ? <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={list.setPage} /> : null}
      </Card>
      <NewQuoteDialog open={creating} onOpenChange={setCreating} onCreated={(id) => navigate(`/administration/devis/${id}`)} />
      <AiQuoteDialog open={generating} onOpenChange={setGenerating} onStarted={(id) => navigate(`/administration/devis/${id}`)} />
    </div>
  );
}
