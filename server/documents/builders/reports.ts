/**
 * Rapports d'une affaire :
 * - analyse des plans : fichiers, planches lues, éléments relevés avec leurs cotes et leur source,
 *   incertitudes signalées par l'agent ;
 * - contrôle qualité : points relevés par les contrôles automatiques sur chaque document, avec leur
 *   statut et les motifs de mise de côté. Ce rapport ne vaut ni certification ni validation structurelle.
 */
import { asc, desc, eq, inArray } from "drizzle-orm";
import { DRAWING_KIND_LABELS, type IssueCategory, ISSUE_SEVERITY_LABELS, VALIDATION_STATUS_LABELS } from "../../../shared/enums.js";
import { DIMENSION_CHECK_LABELS, type DimensionCheck } from "../../../shared/metre.js";
import type { PlanExtraction } from "../../ai/schemas.js";
import { type Database, schema } from "../../db/index.js";
import { dossierStatus } from "../../services/dossier.js";
import { baseMeta, type ExportContext, exportContext } from "../context.js";
import type { Block, DocModel, Row } from "../model.js";

const CATEGORY_LABELS: Record<IssueCategory, string> = {
  completude: "Complétude",
  reference: "Référence",
  source_manquante: "Source manquante",
  incoherence: "Incohérence",
  doublon: "Doublon",
  unite: "Unité",
  calcul: "Calcul",
  tracabilite: "Traçabilité",
  version: "Version",
  reserve: "Réserve",
};

const CONFIDENCE: Record<string, string> = { elevee: "élevée", moyenne: "moyenne", faible: "faible" };
const DIMENSION_SOURCE: Record<string, string> = { cote_lue: "cote lue", texte_lu: "texte lu", deduit: "déduit" };

/* ---------- Rapport d'analyse des plans ---------- */

export async function analysisModel(db: Database, projectId: string): Promise<{ ctx: ExportContext; model: DocModel }> {
  const ctx = await exportContext(db, projectId);
  const drawings = await db.select().from(schema.drawing).where(eq(schema.drawing.projectId, projectId)).orderBy(asc(schema.drawing.createdAt), asc(schema.drawing.pageNumber));
  const fileIds = [...new Set(drawings.map((d) => d.sourceFileId))];
  const files = fileIds.length ? await db.select().from(schema.sourceFile).where(inArray(schema.sourceFile.id, fileIds)) : [];
  const fileName = (id: string) => files.find((f) => f.id === id)?.originalName ?? "fichier";
  const read = drawings.filter((d) => d.extraction && (d.extraction as PlanExtraction).sheet?.readable !== false);

  const blocks: Block[] = [
    {
      type: "callout",
      tone: drawings.length && read.length === drawings.length ? "info" : "warning",
      title: `${files.length} fichier(s), ${drawings.length} planche(s), ${read.length} lue(s)`,
      content: [
        drawings.length
          ? "Chaque élément relevé indique la source de ses dimensions : cote lue sur le plan, texte lu, ou valeur déduite, et pour un PDF vectoriel si la cote figure bien dans le texte de la page. Une valeur déduite ou absente du texte vectoriel reste une hypothèse à vérifier."
          : "Aucune planche n’a encore été analysée : déposez les plans de l’affaire puis lancez la lecture des plans.",
      ],
    },
  ];
  if (drawings.length) {
    blocks.push({ type: "heading", level: 1, text: "Planches analysées" });
    blocks.push({
      type: "table",
      columns: [
        { label: "Fichier et page", width: 26 },
        { label: "N°", width: 8 },
        { label: "Titre", width: "*" },
        { label: "Nature", width: 13 },
        { label: "Niveau", width: 11 },
        { label: "Échelle", width: 9 },
        { label: "Éléments", width: 9, align: "right" },
        { label: "Cotes contrôlées", width: 12, align: "right" },
      ],
      rows: drawings.map((d) => {
        const e = d.extraction as (PlanExtraction & { verification?: { dimensions: number; found: number } }) | null;
        const v = e?.verification;
        return {
          cells: [
            `${fileName(d.sourceFileId)}, page ${d.pageNumber}`,
            [d.sheetNumber, d.revision ? `ind. ${d.revision}` : null].filter(Boolean).join("\n"),
            d.title ?? (e ? "" : "non lue"),
            DRAWING_KIND_LABELS[d.kind],
            d.level ?? "",
            d.scaleRatio ? `1/${Number(d.scaleRatio)}` : (d.scaleText ?? ""),
            { text: String(e?.elements?.length ?? 0), align: "right" },
            { text: !e ? "" : d.textLayer && v ? `${v.found} sur ${v.dimensions}` : "sans texte vectoriel", align: "right", tone: d.textLayer && v && v.found < v.dimensions ? "primary" : undefined },
          ],
        };
      }),
    });
  }
  for (const d of drawings) {
    const e = d.extraction as PlanExtraction | null;
    if (!e) continue;
    blocks.push({ type: "heading", level: 2, number: d.sheetNumber, text: d.title ?? `${fileName(d.sourceFileId)}, page ${d.pageNumber}` });
    blocks.push({
      type: "keyValues",
      rows: [
        ["Fichier", `${fileName(d.sourceFileId)}, page ${d.pageNumber}`],
        ["Nature", DRAWING_KIND_LABELS[d.kind]],
        ["Échelle", [d.scaleRatio ? `1/${Number(d.scaleRatio)}` : (d.scaleText ?? "non lue"), (e as { verification?: { scale: string } }).verification?.scale].filter(Boolean).join(", ")],
        ...(d.revision ? ([["Indice", d.revision]] as Array<[string, string]>) : []),
        ["Texte vectoriel", d.textLayer ? `${d.textLayer.items} textes lus dans le PDF` : "absent, plan scanné ou image : cotes non contrôlables"],
        ["Statut", VALIDATION_STATUS_LABELS[d.status]],
      ],
    });
    if (e.elements?.length) {
      const rows: Row[] = e.elements.map((el) => ({
        cells: [
          [el.designation, el.material].filter(Boolean).join("\n"),
          el.location ?? "",
          el.dimensions
            .map((dim) => {
              const check = (dim as { check?: DimensionCheck }).check;
              return `${dim.name} ${dim.value} ${dim.unit} (${DIMENSION_SOURCE[dim.source] ?? dim.source}${check && check !== "deduite" ? `, ${DIMENSION_CHECK_LABELS[check].toLowerCase()}` : ""})`;
            })
            .join("\n") || "aucune cote",
          { text: el.count !== null ? String(el.count) : "", align: "right" },
          { text: CONFIDENCE[el.confidence] ?? el.confidence, tone: el.confidence === "faible" ? "primary" : undefined },
        ],
      }));
      blocks.push({
        type: "table",
        dense: true,
        columns: [
          { label: "Élément", width: 30 },
          { label: "Localisation", width: 18 },
          { label: "Dimensions et source", width: "*" },
          { label: "Nombre", width: 8, align: "right" },
          { label: "Confiance", width: 10 },
        ],
        rows,
      });
    }
    if (e.uncertainties?.length) blocks.push({ type: "callout", tone: "warning", title: "Incertitudes signalées", content: [e.uncertainties.join(" ; ")] });
    if (e.notes?.length) blocks.push({ type: "note", label: "Notes relevées", content: [e.notes.join(" ; ")] });
  }
  return {
    ctx,
    model: {
      meta: baseMeta(ctx, {
        kind: "analyse",
        typeLabel: "Rapport d’analyse des plans",
        shortLabel: "Analyse",
        title: "Rapport d’analyse des plans",
        version: null,
        status: read.length === drawings.length && drawings.length ? "Analyse terminée" : drawings.length ? "Analyse partielle" : "Aucune planche analysée",
        toc: drawings.length > 4,
        disclaimer: "Relevés établis par lecture automatique des plans : ils doivent être vérifiés avant tout usage contractuel.",
      }),
      blocks,
    },
  };
}

/* ---------- Rapport de contrôle qualité ---------- */

export async function controlModel(db: Database, projectId: string): Promise<{ ctx: ExportContext; model: DocModel }> {
  const ctx = await exportContext(db, projectId);
  const [issues, cctps, dpgfs, measures] = await Promise.all([
    db.select().from(schema.qualityIssue).where(eq(schema.qualityIssue.projectId, projectId)).orderBy(asc(schema.qualityIssue.createdAt)),
    db.select().from(schema.cctpDocument).where(eq(schema.cctpDocument.projectId, projectId)),
    db.select().from(schema.dpgf).where(eq(schema.dpgf.projectId, projectId)),
    db.select({ status: schema.measurement.status }).from(schema.measurement).where(eq(schema.measurement.projectId, projectId)),
  ]);
  const titles = new Map<string, string>([...cctps.map((d) => [d.id, d.title] as const), ...dpgfs.map((d) => [d.id, d.title] as const)]);
  const lines = dpgfs.length ? await db.select({ dpgfId: schema.dpgfLine.dpgfId, kind: schema.dpgfLine.kind, quantity: schema.dpgfLine.quantity, unitPrice: schema.dpgfLine.unitPrice }).from(schema.dpgfLine).where(inArray(schema.dpgfLine.dpgfId, dpgfs.map((d) => d.id))) : [];
  const open = issues.filter((i) => i.status === "ouverte");
  const blocking = open.filter((i) => i.severity === "bloquante").length;
  const major = open.filter((i) => i.severity === "majeure").length;
  const status = await dossierStatus(db, projectId);
  const [lastAudit] = await db.select().from(schema.dossierAudit).where(eq(schema.dossierAudit.projectId, projectId)).orderBy(desc(schema.dossierAudit.createdAt)).limit(1);

  const blocks: Block[] = [
    {
      type: "callout",
      tone: blocking ? "danger" : major ? "warning" : "info",
      title: `${open.length} point(s) ouvert(s), dont ${blocking} bloquant(s) et ${major} majeur(s)`,
      content: ["Contrôles automatiques de cohérence, de complétude, de traçabilité et de calcul. Ils signalent des points à examiner ; ils ne valent ni certification réglementaire, ni validation structurelle, ni contrôle par un professionnel habilité."],
    },
    { type: "heading", level: 1, text: "Couverture du dossier" },
    {
      type: "keyValues",
      rows: [
        ["CCTP", cctps.length ? cctps.map((d) => d.title).join(", ") : "aucun"],
        ["DPGF", dpgfs.length ? dpgfs.map((d) => d.title).join(", ") : "aucune"],
        ["Postes de DPGF", `${lines.filter((l) => l.kind === "poste").length} poste(s), ${lines.filter((l) => l.kind === "poste" && l.quantity !== null).length} quantifié(s), ${lines.filter((l) => l.kind === "poste" && l.unitPrice !== null).length} chiffré(s)`],
        ["Mesures du métré", `${measures.length} mesure(s), ${measures.filter((m) => m.status === "verifie").length} vérifiée(s), ${measures.filter((m) => m.status === "a_verifier").length} à vérifier`],
      ],
    },
    { type: "heading", level: 1, text: "Contrôle indépendant et niveau du dossier" },
    {
      type: "keyValues",
      rows: [
        ["Niveau du dossier", status.levelLabel],
        ...status.criteria.filter((c) => !c.met && c.detail).slice(0, 1).map((c): [string, string] => ["Reste à faire", c.detail!]),
        ["Dernier contrôle", lastAudit ? `${lastAudit.createdAt.toLocaleString("fr-FR", { timeZone: "Africa/Casablanca", dateStyle: "long", timeStyle: "short" })}, ${status.audit?.upToDate ? "à jour" : "dossier modifié depuis"}` : "jamais lancé"],
        ["Corrections de calcul", lastAudit ? `${lastAudit.summary.fixes.length} au dernier contrôle` : "aucune"],
        ...(status.validation ? [["Validation professionnelle", `${status.validation.signedBy}, ${status.validation.qualification}${status.validation.current ? "" : ", déclaration à renouveler"}`] as [string, string]] : []),
      ],
    },
    ...(lastAudit && lastAudit.summary.fixes.length
      ? [
          {
            type: "table" as const,
            dense: true,
            columns: [
              { label: "Élément corrigé", width: 30 },
              { label: "Correction", width: "*" as const },
            ],
            rows: lastAudit.summary.fixes.slice(0, 60).map((f) => ({ cells: [f.target, f.note] })),
          },
        ]
      : []),
  ];
  const groups = new Map<string, typeof issues>();
  for (const issue of issues) {
    const key = issue.documentId ? `${issue.documentType}:${issue.documentId}` : "affaire";
    groups.set(key, [...(groups.get(key) ?? []), issue]);
  }
  const typeLabel: Record<string, string> = { cctp: "CCTP", dpgf: "DPGF", sous_detail: "Sous-détails", devis: "Devis", metre: "Métré", dossier: "Dossier" };
  const order = { bloquante: 0, majeure: 1, mineure: 2, information: 3 } as const;
  for (const [key, list] of groups) {
    const [type, id] = key.split(":");
    const title = key === "affaire" ? "Affaire" : type === "metre" || type === "dossier" ? typeLabel[type]! : `${typeLabel[type!] ?? type} : ${titles.get(id!) ?? "document"}`;
    blocks.push({ type: "heading", level: 2, text: title });
    blocks.push({
      type: "table",
      dense: true,
      columns: [
        { label: "Gravité", width: 12 },
        { label: "Catégorie", width: 15 },
        { label: "Point relevé", width: "*" },
        { label: "Statut", width: 18 },
      ],
      rows: [...list]
        .sort((a, b) => order[a.severity] - order[b.severity])
        .map((i) => ({
          cells: [
            { text: ISSUE_SEVERITY_LABELS[i.severity], tone: i.severity === "bloquante" || i.severity === "majeure" ? "primary" : undefined },
            CATEGORY_LABELS[i.category],
            i.message,
            i.status === "ouverte" ? "Ouvert" : i.status === "resolue" ? "Résolu" : `Mis de côté${i.resolutionNote ? `\n${i.resolutionNote}` : ""}`,
          ],
        })),
    });
  }
  if (!issues.length) blocks.push({ type: "paragraph", tone: "muted", content: ["Aucun point n’a été relevé par les contrôles automatiques à cette date."] });
  return {
    ctx,
    model: {
      meta: baseMeta(ctx, {
        kind: "controle",
        typeLabel: "Rapport de contrôle qualité",
        shortLabel: "Contrôle",
        title: "Rapport de contrôle qualité",
        version: null,
        status: blocking ? "Points bloquants à traiter" : open.length ? "Points à examiner" : "Aucun point ouvert",
        toc: false,
        disclaimer: "Contrôles automatiques : ce rapport ne constitue ni une certification réglementaire ni une validation structurelle.",
      }),
      blocks,
    },
  };
}
