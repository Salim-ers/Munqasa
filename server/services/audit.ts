/** Journal d'audit : chaque événement sensible est enregistré (qui, quoi, quand, d'où). */
import { getDb, schema } from "../db/index.js";

export interface AuditEntry {
  action: string;
  actorUserId?: string | null;
  entityType?: string;
  entityId?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  details?: Record<string, unknown>;
}

export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    const db = await getDb();
    await db.insert(schema.auditLog).values({
      action: entry.action,
      actorUserId: entry.actorUserId ?? null,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent?.slice(0, 500) ?? null,
      details: entry.details ?? {},
    });
  } catch (error) {
    // Le journal ne doit jamais faire échouer l'action elle-même ; l'échec reste visible dans les journaux serveur.
    console.error("[audit] écriture impossible", error instanceof Error ? error.message : error);
  }
}

/** Adresse IP et navigateur d'une requête (en-têtes posés par Vercel). */
export function requestOrigin(headers: Headers): { ipAddress: string | null; userAgent: string | null } {
  const forwarded = headers.get("x-forwarded-for");
  return {
    ipAddress: forwarded ? (forwarded.split(",")[0]?.trim() ?? null) : headers.get("x-real-ip"),
    userAgent: headers.get("user-agent"),
  };
}

/** Journalise une action de l'administrateur depuis une route Hono (session + origine de la requête). */
export async function auditAction(
  c: { req: { raw: Request }; get(key: "session"): { user: { id: string } } },
  action: string,
  entityType: string,
  entityId: string | null,
  details: Record<string, unknown> = {},
): Promise<void> {
  await writeAudit({
    action,
    actorUserId: c.get("session").user.id,
    entityType,
    entityId: entityId ?? undefined,
    details,
    ...requestOrigin(c.req.raw.headers),
  });
}
