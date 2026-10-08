/** Validation des entrées avec les schémas partagés (shared/schemas.ts). Erreurs renvoyées par champ. */
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { z } from "zod";

export class ValidationError extends HTTPException {
  constructor(readonly fields: Record<string, string>) {
    super(400, { message: "Certains champs sont invalides." });
  }
}

export function parse<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join(".") || "_";
      fields[key] ??= issue.message;
    }
    throw new ValidationError(fields);
  }
  return result.data;
}

async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new ValidationError({ _: "Corps de requête JSON attendu." });
  }
}

export async function body<S extends z.ZodType>(c: Context, schema: S): Promise<z.output<S>> {
  return parse(schema, await readJson(c));
}

/**
 * Modification partielle : seuls les champs présents dans la requête sont validés et conservés.
 * (Zod 4 réinjecte les valeurs par défaut des champs absents, ce qui écraserait les données existantes.)
 */
export async function patchBody<S extends z.ZodObject>(c: Context, schema: S): Promise<Partial<z.output<S>>> {
  const json = await readJson(c);
  if (!json || typeof json !== "object" || Array.isArray(json)) throw new ValidationError({ _: "Objet JSON attendu." });
  const data = parse(schema.partial(), json) as Record<string, unknown>;
  return Object.fromEntries(Object.entries(data).filter(([key]) => Object.hasOwn(json, key))) as Partial<z.output<S>>;
}

/** Identifiant UUID dans l'URL. */
export function uuidParam(c: Context, name = "id"): string {
  const value = c.req.param(name) ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new HTTPException(404, { message: "Ressource introuvable." });
  }
  return value;
}

export function notFound(message = "Ressource introuvable."): never {
  throw new HTTPException(404, { message });
}

export function conflict(message: string): never {
  throw new HTTPException(409, { message });
}
