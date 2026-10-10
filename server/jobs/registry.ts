/** Gestionnaires des traitements longs, par nature. */
import type { JobKind } from "../../shared/enums.js";
import { cctpHandler } from "./handlers/cctp.js";
import { dossierHandler } from "./handlers/dossier.js";
import { dossierAuditHandler } from "./handlers/dossier-audit.js";
import { dpgfHandler } from "./handlers/dpgf.js";
import { planAnalysisHandler } from "./handlers/plan-analysis.js";
import { priceImportHandler } from "./handlers/price-import.js";
import { sousDetailHandler } from "./handlers/sous-detail.js";
import type { JobHandler } from "./types.js";

const handlers: Partial<Record<JobKind, JobHandler>> = {
  analyse_plans: planAnalysisHandler,
  generation_cctp: cctpHandler,
  generation_dpgf: dpgfHandler,
  sous_detail: sousDetailHandler,
  import_prix: priceImportHandler,
  controle_qualite: dossierAuditHandler,
  generation_dossier: dossierHandler,
};

export function handlerFor(kind: JobKind): JobHandler {
  const handler = handlers[kind];
  if (!handler) throw new Error(`Traitement non disponible : ${kind}.`);
  return handler;
}
