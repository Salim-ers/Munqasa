/** État des listes (recherche, filtres, tri, page) dans l'URL : partageable, conservé au retour arrière. */
import { useSearchParams } from "react-router";
import type { Sort } from "../components/ui/DataTable";

export function useListParams(defaultSort: Sort) {
  const [params, setParams] = useSearchParams();

  const set = (patch: Record<string, string | null>, resetPage = true) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(patch)) {
          if (value === null || value === "") next.delete(key);
          else next.set(key, value);
        }
        if (resetPage && !("page" in patch)) next.delete("page");
        return next;
      },
      { replace: true },
    );
  };

  const sortParam = params.get("tri");
  const sort: Sort = sortParam ? { id: sortParam.replace(/^-/, ""), desc: sortParam.startsWith("-") } : defaultSort;

  return {
    get: (key: string) => params.get(key) ?? "",
    set,
    page: Math.max(1, Number(params.get("page")) || 1),
    setPage: (page: number) => set({ page: page > 1 ? String(page) : null }, false),
    sort,
    setSort: (next: Sort | null) => set({ tri: next ? `${next.desc ? "-" : ""}${next.id}` : null }),
    /** Paramètres de tri attendus par l'API. */
    sortQuery: { sort: sort.id, dir: sort.desc ? "desc" : "asc" },
  };
}
