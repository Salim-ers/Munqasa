import { CircleAlert, CircleCheck, CircleDashed, CircleMinus, OctagonAlert } from "lucide-react";
import { type AuditPointState, AUDIT_POINT_HINTS, AUDIT_STATE_LABELS, type ExportAudit } from "../../shared/audit";
import { formatDateTime } from "../lib/format";
import { cn } from "../lib/cn";

const ICONS: Record<AuditPointState, { icon: typeof CircleCheck; className: string }> = {
  conforme: { icon: CircleCheck, className: "text-success" },
  reserves: { icon: CircleAlert, className: "text-warning" },
  bloquant: { icon: OctagonAlert, className: "text-danger" },
  non_controle: { icon: CircleDashed, className: "text-ink-3" },
  sans_objet: { icon: CircleMinus, className: "text-ink-3" },
};

/** Les quinze points du contrôle avant export, avec le verdict et les anomalies de chaque point. */
export function ExportAuditView({ audit, renderingNote }: { audit: ExportAudit; renderingNote?: string }) {
  const tone = audit.verdict === "bloquant" ? "border-danger/25 bg-danger-soft" : audit.verdict === "reserves" ? "border-warning/25 bg-warning-soft" : "border-success/25 bg-success-soft";
  const Verdict = audit.verdict === "bloquant" ? OctagonAlert : audit.verdict === "reserves" ? CircleAlert : CircleCheck;
  return (
    <div className="grid gap-3">
      <div className={cn("flex gap-2.5 rounded-xl border p-3 text-xs leading-relaxed text-ink-2", tone)}>
        <Verdict className={cn("mt-0.5 size-4 shrink-0", audit.verdict === "bloquant" ? "text-danger" : audit.verdict === "reserves" ? "text-warning" : "text-success")} aria-hidden="true" />
        <p>{`${audit.verdictLabel}.`}</p>
      </div>
      <ul className="grid gap-1" aria-label="Points contrôlés avant l’export">
        {audit.points.map((p) => {
          const { icon: Icon, className } = ICONS[p.state];
          return (
            <li key={p.point} className={cn("rounded-xl px-2.5 py-2", (p.state === "bloquant" || p.state === "reserves") && "bg-surface-2")}>
              <div className="flex items-start gap-2.5">
                <Icon className={cn("mt-0.5 size-4 shrink-0", className)} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="text-xs font-semibold text-ink">{p.label}</p>
                    <p className={cn("text-2xs font-semibold", className)}>{AUDIT_STATE_LABELS[p.state]}</p>
                  </div>
                  {p.details.length ? (
                    <ul className="mt-1 grid gap-0.5 text-2xs leading-relaxed text-ink-2">
                      {p.details.map((d, i) => (
                        <li key={i} className="break-words">
                          {d}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-0.5 text-2xs leading-relaxed text-ink-3">{AUDIT_POINT_HINTS[p.point]}</p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-2xs leading-relaxed text-ink-3">
        {renderingNote ??
          (audit.rendering.checkedAt
            ? `Fichiers produits contrôlés le ${formatDateTime(audit.rendering.checkedAt)} : ${audit.rendering.files} fichier(s), ${audit.rendering.anomalies} anomalie(s) de rendu${audit.rendering.upToDate ? "" : ", contrôle à refaire après les dernières modifications"}.`
            : "Fichiers produits pas encore contrôlés : la mise en page et la pagination le seront par le contrôle indépendant ou par l’export du dossier complet.")}
      </p>
    </div>
  );
}
