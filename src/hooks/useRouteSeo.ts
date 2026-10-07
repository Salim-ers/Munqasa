import { useEffect } from "react";
import { NOT_FOUND_META, routeMeta } from "../data/routes";
import { site } from "../data/site";

function setMeta(selector: string, attr: "content" | "href", value: string) {
  document.head.querySelector(selector)?.setAttribute(attr, value);
}

/**
 * Met à jour <title> et les balises de la route courante après une navigation
 * côté client. Le HTML statique de chaque route (généré au build) contient
 * déjà ces valeurs pour les robots et les aperçus de liens.
 */
export function useRouteSeo(pathname: string) {
  useEffect(() => {
    const meta = routeMeta(pathname);
    const title = meta?.title ?? NOT_FOUND_META.title;
    const description = meta?.description ?? NOT_FOUND_META.description;
    const url = meta ? `${site.url}${meta.path === "/" ? "/" : meta.path}` : `${site.url}${pathname}`;

    document.title = title;
    setMeta('meta[name="description"]', "content", description);
    setMeta('meta[name="robots"]', "content", meta?.indexable ? "index, follow" : "noindex, follow");
    setMeta('link[rel="canonical"]', "href", url);
    setMeta('meta[property="og:title"]', "content", title);
    setMeta('meta[property="og:description"]', "content", description);
    setMeta('meta[property="og:url"]', "content", url);
    setMeta('meta[name="twitter:title"]', "content", title);
    setMeta('meta[name="twitter:description"]', "content", description);
  }, [pathname]);
}
