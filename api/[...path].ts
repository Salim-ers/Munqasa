/**
 * Fonction Vercel unique pour /api/* (hors /api/contact, servi par son propre fichier) :
 * délègue à l'API Hono (server/http/app.ts).
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
