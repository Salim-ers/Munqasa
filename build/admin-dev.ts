/**
 * Plugin Vite (développement et prévisualisation locale uniquement) :
 * - /api/* (hors /api/contact) → l'API Hono de server/http/app.ts, comme la fonction Vercel ;
 * - /administration/* → administration/index.html (application monopage de l'administration).
 * En production, Vercel fait la même chose avec api/index.ts et la réécriture de vercel.json.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { createServer, type Connect, type Plugin, type ViteDevServer } from "vite";

type ApiApp = { fetch(request: Request): Response | Promise<Response> };

async function toRequest(req: IncomingMessage): Promise<Request> {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
    else headers.set(key, value);
  }
  // En local, l'adresse du poste tient lieu d'adresse client (Vercel pose x-forwarded-for en production).
  if (!headers.has("x-forwarded-for") && req.socket.remoteAddress) headers.set("x-forwarded-for", req.socket.remoteAddress);
  const method = req.method ?? "GET";
  const chunks: Buffer[] = [];
  if (method !== "GET" && method !== "HEAD") for await (const chunk of req) chunks.push(chunk as Buffer);
  return new Request(`http://${req.headers.host ?? "localhost"}${req.url ?? "/"}`, {
    method,
    headers,
    body: chunks.length ? Buffer.concat(chunks) : undefined,
  });
}

async function send(res: ServerResponse, response: Response) {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    if (key !== "set-cookie") res.setHeader(key, value);
  });
  // Plusieurs cookies (session, double authentification…) : tous transmis.
  const cookies = response.headers.getSetCookie();
  if (cookies.length) res.setHeader("set-cookie", cookies);
  if (!response.body) return res.end();
  Readable.fromWeb(response.body as import("node:stream/web").ReadableStream).pipe(res);
}

function apiMiddleware(loadApp: () => Promise<ApiApp>): Connect.NextHandleFunction {
  return (req, res, next) => {
    const url = req.url ?? "";
    if (!url.startsWith("/api/") || url.startsWith("/api/contact")) return next();
    (async () => {
      const app = await loadApp();
      await send(res, await app.fetch(await toRequest(req)));
    })().catch(next);
  };
}

const adminFallback: Connect.NextHandleFunction = (req, _res, next) => {
  const path = (req.url ?? "").split("?")[0] ?? "";
  if ((path === "/administration" || path.startsWith("/administration/")) && !/\.[a-z0-9]+$/i.test(path)) {
    req.url = "/administration/index.html";
  }
  next();
};

export function adminDevPlugin(): Plugin {
  let ssr: ViteDevServer | null = null;
  return {
    name: "talab-admin-dev",
    configureServer(server) {
      // En local, l'adresse de l'application suit le port réel du serveur (origines, passkeys).
      server.httpServer?.once("listening", () => {
        const address = server.httpServer?.address();
        if (!process.env.APP_URL && address && typeof address === "object") process.env.APP_URL = `http://localhost:${address.port}`;
      });
      server.middlewares.use(apiMiddleware(async () => ((await server.ssrLoadModule("/server/http/app.ts")) as { getApp(): ApiApp }).getApp()));
      server.middlewares.use(adminFallback);
    },
    configurePreviewServer(server) {
      server.httpServer?.once("listening", () => {
        const address = server.httpServer?.address();
        if (!process.env.APP_URL && address && typeof address === "object") process.env.APP_URL = `http://localhost:${address.port}`;
      });
      // Prévisualisation du build : le code serveur (TypeScript) est chargé par un serveur Vite interne.
      server.middlewares.use(
        apiMiddleware(async () => {
          ssr ??= await createServer({
            configFile: false,
            root: server.config.root,
            logLevel: "error",
            appType: "custom",
            server: { middlewareMode: true, hmr: false, watch: null },
            optimizeDeps: { noDiscovery: true, include: [] },
          });
          return ((await ssr.ssrLoadModule("/server/http/app.ts")) as { getApp(): ApiApp }).getApp();
        }),
      );
      server.middlewares.use(adminFallback);
    },
  };
}
