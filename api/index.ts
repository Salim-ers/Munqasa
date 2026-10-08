/**
 * Fonction Vercel unique pour /api/* : vercel.json réécrit /api/... vers cette fonction
 * (hors /api/contact, servi en priorité par son propre fichier). L'URL d'origine est conservée :
 * l'API Hono (server/http/app.ts) route sur le chemin demandé.
 */
import { getApp } from "../server/http/app.js";

function handle(request: Request): Promise<Response> | Response {
  return getApp().fetch(request);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
