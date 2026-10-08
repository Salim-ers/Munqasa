/**
 * Plugin Vite (développement uniquement) — sert POST /api/contact avec le
 * même gestionnaire que la fonction Vercel. Sans configuration d'envoi, la
 * demande est affichée dans le terminal.
 */
import type { IncomingMessage } from "node:http";
import type { Plugin } from "vite";
import type { ContactEnv, handleContact as HandleContact } from "../api/_lib/contact-handler.ts";

async function toRequest(req: IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }
  const method = req.method ?? "GET";
  return new Request(`http://${req.headers.host ?? "localhost"}${req.url ?? "/"}`, {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : Buffer.concat(chunks),
  });
}

export function devApiPlugin(env: ContactEnv): Plugin {
  return {
    name: "talab-dev-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/contact")) return next();
        try {
          const mod = (await server.ssrLoadModule("/api/_lib/contact-handler.ts")) as { handleContact: typeof HandleContact };
          const response = await mod.handleContact(await toRequest(req), { ...env, dev: true });
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (err) {
          next(err);
        }
      });
    },
  };
}
