/**
 * Plugin Vite — SEO statique.
 *
 * - injecte dans index.html les balises de la page d'accueil (title, meta,
 *   canonical, Open Graph, JSON-LD) — le préchargement du hero dépend de la
 *   lumière choisie et est ajouté par public/theme-init.js ;
 * - au build, écrit un HTML par route (dist/services.html…) avec ses propres
 *   balises : les robots et les aperçus de liens lisent le bon contenu sans
 *   exécuter le JavaScript ;
 * - génère sitemap.xml, robots.txt et 404.html.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin, ResolvedConfig } from "vite";
import { NOT_FOUND_META, ROUTES, routeMeta, type RouteMeta } from "../src/data/routes.ts";

const START = "<!--head:start-->";
const END = "<!--head:end-->";

const SERVICES = [
  "Veille & opportunités",
  "Analyse du dossier de consultation",
  "Dossier administratif",
  "Structuration de l'offre technique",
  "Coordination des intervenants",
  "Contrôle avant dépôt",
  "Préparation à la soumission",
  "Suivi des consultations",
];

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

interface HeadInput {
  path: string | null;
  label: string;
  title: string;
  description: string;
  indexable: boolean;
}

function jsonLd(site: string, page: HeadInput): string {
  const org = {
    "@type": "Organization",
    "@id": `${site}/#organization`,
    name: "Talab Solutions",
    url: `${site}/`,
    logo: `${site}/logos/talab-day-logo.png`,
    image: `${site}/og-image.jpg`,
    slogan: "De l'avis à la soumission.",
    description:
      "Gestion et accompagnement des appels d'offres au Maroc : veille, analyse des dossiers de consultation, dossier administratif, offre technique, coordination, contrôle avant dépôt et suivi.",
    areaServed: { "@type": "Country", name: "Maroc" },
    knowsAbout: ["Appels d'offres", "Marchés publics", "Dossier administratif", "Offre technique", "Veille d'appels d'offres"],
  };
  const website = {
    "@type": "WebSite",
    "@id": `${site}/#website`,
    url: `${site}/`,
    name: "Talab Solutions",
    inLanguage: "fr-MA",
    publisher: { "@id": `${site}/#organization` },
  };
  const graph: object[] = [org, website];
  if (page.path && page.path !== "/") {
    graph.push({
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Accueil", item: `${site}/` },
        { "@type": "ListItem", position: 2, name: page.label, item: `${site}${page.path}` },
      ],
    });
  }
  if (page.path === "/services") {
    graph.push({
      "@type": "ItemList",
      name: "Services Talab Solutions",
      itemListElement: SERVICES.map((name, i) => ({
        "@type": "ListItem",
        position: i + 1,
        item: { "@type": "Service", name, areaServed: "Maroc", provider: { "@id": `${site}/#organization` } },
      })),
    });
  }
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c");
}

function renderHead(site: string, page: HeadInput): string {
  const url = page.path ? `${site}${page.path === "/" ? "/" : page.path}` : null;
  const tags = [
    `<title>${esc(page.title)}</title>`,
    `<meta name="description" content="${esc(page.description)}" />`,
    `<meta name="robots" content="${page.indexable ? "index, follow" : "noindex, follow"}" />`,
    url ? `<link rel="canonical" href="${url}" />` : "",
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Talab Solutions" />`,
    `<meta property="og:locale" content="fr_MA" />`,
    `<meta property="og:title" content="${esc(page.title)}" />`,
    `<meta property="og:description" content="${esc(page.description)}" />`,
    url ? `<meta property="og:url" content="${url}" />` : "",
    `<meta property="og:image" content="${site}/og-image.jpg" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="Talab Solutions, appels d’offres au Maroc" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(page.title)}" />`,
    `<meta name="twitter:description" content="${esc(page.description)}" />`,
    `<meta name="twitter:image" content="${site}/og-image.jpg" />`,
    `<script type="application/ld+json">${jsonLd(site, page)}</script>`,
  ].filter(Boolean);
  return `${START}\n    ${tags.join("\n    ")}\n    ${END}`;
}

const fromRoute = (r: RouteMeta): HeadInput => ({ ...r });

export function seoPlugin(siteUrl: string): Plugin {
  const site = siteUrl.replace(/\/+$/, "");
  let config: ResolvedConfig;
  const home = ROUTES.find((r) => r.path === "/");
  if (!home) throw new Error("La route / est requise.");

  return {
    name: "talab-seo",
    configResolved(c) {
      config = c;
    },
    transformIndexHtml(html, ctx) {
      // En développement, chaque URL reçoit les balises de sa propre route ;
      // au build, index.html porte celles de l'accueil (les autres sont écrites ensuite).
      if (ctx.server) {
        const pathname = new URL(ctx.originalUrl ?? ctx.path, "http://localhost").pathname;
        const route = routeMeta(pathname);
        const page = route ? fromRoute(route) : { path: null, ...NOT_FOUND_META, indexable: false };
        return html.replace("<!--app-head-->", renderHead(site, page));
      }
      return html.replace("<!--app-head-->", renderHead(site, fromRoute(home)));
    },
    closeBundle() {
      if (config.command !== "build") return;
      const out = resolve(config.root, config.build.outDir);
      const template = readFileSync(resolve(out, "index.html"), "utf8");
      const block = new RegExp(`${START}[\\s\\S]*?${END}`);
      if (!block.test(template)) throw new Error("Bloc <head> SEO introuvable dans dist/index.html.");

      for (const route of ROUTES) {
        if (route.path === "/") continue;
        writeFileSync(resolve(out, `${route.path.slice(1)}.html`), template.replace(block, renderHead(site, fromRoute(route))));
      }
      writeFileSync(
        resolve(out, "404.html"),
        template.replace(block, renderHead(site, { path: null, ...NOT_FOUND_META, indexable: false })),
      );

      const urls = ROUTES.filter((r) => r.indexable)
        .map((r) => `  <url>\n    <loc>${site}${r.path === "/" ? "/" : r.path}</loc>\n    <priority>${r.priority.toFixed(1)}</priority>\n  </url>`)
        .join("\n");
      writeFileSync(
        resolve(out, "sitemap.xml"),
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
      );
      writeFileSync(resolve(out, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /administration\n\nSitemap: ${site}/sitemap.xml\n`);
    },
  };
}
