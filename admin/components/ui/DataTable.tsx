/**
 * Tableau de données (TanStack Table) trié et paginé côté serveur. Sur téléphone, chaque ligne
 * devient une carte. Aucune ligne fictive : sans données, un état vide explicite.
 */
import { type ColumnDef, flexRender, getCoreRowModel, type RowData, type SortingState, useReactTable } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { Skeleton } from "./Feedback";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    align?: "left" | "right";
    className?: string;
  }
}

export interface Sort {
  id: string;
  desc: boolean;
}

export interface DataTableProps<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: Array<ColumnDef<T, any>>;
  data: T[] | undefined;
  loading: boolean;
  getRowId: (row: T) => string;
  empty: ReactNode;
  sort?: Sort | null;
  onSortChange?: (sort: Sort | null) => void;
  onRowClick?: (row: T) => void;
  /** Rendu en carte sur les écrans étroits. */
  mobileCard?: (row: T) => ReactNode;
  /** Largeur sous laquelle les cartes remplacent le tableau (selon le nombre de colonnes). */
  cardsBelow?: "md" | "lg" | "xl";
  minWidth?: string;
  label: string;
}

/** Classes complètes (Tailwind ne génère que les classes écrites en toutes lettres). */
const CARD_BREAKPOINTS = {
  md: { cards: "md:hidden", table: "hidden md:block" },
  lg: { cards: "lg:hidden", table: "hidden lg:block" },
  xl: { cards: "xl:hidden", table: "hidden xl:block" },
} as const;

export function DataTable<T>({ columns, data, loading, getRowId, empty, sort, onSortChange, onRowClick, mobileCard, cardsBelow = "lg", minWidth = "48rem", label }: DataTableProps<T>) {
  const breakpoint = CARD_BREAKPOINTS[cardsBelow];
  const sorting: SortingState = sort ? [sort] : [];
  const table = useReactTable({
    data: data ?? [],
    columns,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    enableSortingRemoval: false,
    state: { sorting },
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      onSortChange?.(next[0] ?? null);
    },
  });

  if (loading) {
    return (
      <div className="grid gap-2 p-5" aria-busy="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-11" />
        ))}
      </div>
    );
  }
  if (!data || data.length === 0) return <>{empty}</>;

  return (
    <>
      {mobileCard ? (
        <ul className={cn("divide-y divide-line", breakpoint.cards)} aria-label={label}>
          {table.getRowModel().rows.map((row) => (
            <li key={row.id}>{mobileCard(row.original)}</li>
          ))}
        </ul>
      ) : null}
      <div className={cn("overflow-x-auto", mobileCard && breakpoint.table)}>
        <table className="w-full text-left text-xs" style={{ minWidth }} aria-label={label}>
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id} className="border-y border-line text-2xs font-semibold tracking-wide text-ink-3 uppercase">
                {group.headers.map((header, index) => {
                  const meta = header.column.columnDef.meta;
                  const sortable = header.column.getCanSort();
                  const direction = header.column.getIsSorted();
                  const edge = index === 0 ? "pl-5" : index === group.headers.length - 1 ? "pr-5" : "";
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      className={cn("px-3 py-2.5 font-semibold", edge, meta?.align === "right" && "text-right", meta?.className)}
                      aria-sort={direction ? (direction === "desc" ? "descending" : "ascending") : undefined}
                    >
                      {sortable ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className={cn("inline-flex items-center gap-1 uppercase hover:text-ink", direction && "text-ink", meta?.align === "right" && "flex-row-reverse")}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {direction === "asc" ? (
                            <ArrowUp className="size-3" aria-hidden="true" />
                          ) : direction === "desc" ? (
                            <ArrowDown className="size-3" aria-hidden="true" />
                          ) : (
                            <ChevronsUpDown className="size-3 opacity-50" aria-hidden="true" />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                onClick={onRowClick ? (e) => !(e.target as HTMLElement).closest("a,button,input,select,[role=menuitem]") && onRowClick(row.original) : undefined}
                className={cn("border-b border-line transition-colors last:border-0 hover:bg-surface-2", onRowClick && "cursor-pointer")}
              >
                {row.getVisibleCells().map((cell, index, cells) => {
                  const meta = cell.column.columnDef.meta;
                  const edge = index === 0 ? "pl-5" : index === cells.length - 1 ? "pr-5" : "";
                  return (
                    <td key={cell.id} className={cn("px-3 py-3 align-middle", edge, meta?.align === "right" && "text-right", meta?.className)}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** Pagination : position, précédent, suivant. */
export function Pagination({ page, pageSize, total, onPageChange }: { page: number; pageSize: number; total: number; onPageChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav className="flex items-center justify-between gap-3 border-t border-line px-5 py-3 text-xs text-ink-3" aria-label="Pagination">
      <p className="tabular">
        {from} à {to} sur {total}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="grid size-9 place-items-center rounded-lg text-ink-2 hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-40"
          aria-label="Page précédente"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </button>
        <span className="px-2 font-medium text-ink-2 tabular">
          {page} / {pages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pages}
          className="grid size-9 place-items-center rounded-lg text-ink-2 hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-40"
          aria-label="Page suivante"
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
