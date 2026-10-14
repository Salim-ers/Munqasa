/** Démonstration : état (référentiel, prix utilisables, affaires) et préparation sur action explicite. */
import { Hono } from "hono";
import { demoPreparationInput } from "../../../shared/schemas.js";
import type { AdminEnv } from "../../auth/guard.js";
import { getDb } from "../../db/index.js";
import { auditAction } from "../../services/audit.js";
import { demoStatus, prepareDemo } from "../../services/demo.js";
import { body } from "../validate.js";

export const demoRoutes = new Hono<AdminEnv>()
  .get("/", async (c) => {
    const db = await getDb();
    return c.json({ status: await demoStatus(db) });
  })
  .post("/", async (c) => {
    const db = await getDb();
    const data = await body(c, demoPreparationInput);
    const result = await prepareDemo(db, { prices: data.prices });
    for (const p of result.projects.filter((p) => p.created)) await auditAction(c, "affaire.creation", "project", p.id, { reference: p.reference, nom: p.name, demonstration: true });
    if (result.prices) await auditAction(c, "reglages.alertes", "app_setting", "alertes", { anciennete_admise: result.prices });
    await auditAction(c, "demonstration.preparation", "app_setting", "demonstration", {
      references_ajoutees: result.references.imported,
      references_completees: result.references.updated,
      references_retirees: result.references.withdrawn,
      affaires_creees: result.projects.filter((p) => p.created).map((p) => p.reference),
    });
    return c.json({ result, status: await demoStatus(db) });
  });
