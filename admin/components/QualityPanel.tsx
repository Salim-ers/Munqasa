import { useMutation } from "@tanstack/react-query";
import { CircleCheck, RotateCcw, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ISSUE_SEVERITY_LABELS } from "../../shared/enums";
import { api, errorMessage } from "../lib/api";
import { cn } from "../lib/cn";
import type { QualityIssue } from "../lib/types";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { Card, CardHeader } from "./ui/Card";
import { Modal } from "./ui/Dialog";
import { TextareaField } from "./ui/Field";

const tone = { bloquante: "danger", majeure: "warning", mineure: "neutral", information: "neutral" } as const;

/** Points relevés par le contrôle qualité : une anomalie bloquante empêche la validation du document. */
export function QualityPanel({ issues, onChanged, onSelectTarget }: { issues: QualityIssue[]; onChanged: () => void; onSelectTarget?: (id: string) => void }) {
  const [ignoring, setIgnoring] = useState<QualityIssue | null>(null);
  const [note, setNote] = useState("");
  const open = issues.filter((i) => i.status === "ouverte");
  const set = issues.filter((i) => i.status !== "ouverte");

  const ignore = useMutation({
    mutationFn: () => api(`/quality-issues/${ignoring!.id}/ignore`, { body: { note } }),
    onSuccess: () => {
      toast.success("Point mis de côté.");
      setIgnoring(null);
      onChanged();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const reopen = useMutation({ mutationFn: (id: string) => api(`/quality-issues/${id}/reopen`, { body: {} }), onSuccess: onChanged, onError: (e) => toast.error(errorMessage(e)) });

  return (
    <Card className="p-5">
      <CardHeader title="Contrôle qualité" subtitle={open.length ? `${open.length} point(s) ouvert(s)` : "Aucun point ouvert"} />
      {open.length === 0 ? (
        <p className="mt-4 flex items-center gap-2 text-xs text-success">
          <CircleCheck className="size-4" aria-hidden="true" />
          Le dernier contrôle n’a relevé aucun point ouvert.
        </p>
      ) : (
        <ul className="mt-4 grid gap-2">
          {open.map((issue) => {
            const target = issue.targets.find((t) => t.type === "cctp_section" || t.type === "dpgf_line");
            return (
              <li key={issue.id} className={cn("rounded-xl border p-3", issue.severity === "bloquante" ? "border-danger/30 bg-danger-soft" : "border-line")}>
                <div className="flex items-start gap-2.5">
                  <ShieldAlert className={cn("mt-0.5 size-4 shrink-0", issue.severity === "bloquante" ? "text-danger" : issue.severity === "majeure" ? "text-warning" : "text-ink-3")} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-2xs leading-relaxed text-ink">{issue.message}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Badge tone={tone[issue.severity]}>{ISSUE_SEVERITY_LABELS[issue.severity]}</Badge>
                      {target && onSelectTarget ? (
                        <button type="button" onClick={() => onSelectTarget(target.id)} className="text-2xs font-semibold text-accent hover:underline">
                          Voir
                        </button>
                      ) : null}
                      {issue.severity !== "bloquante" ? (
                        <button
                          type="button"
                          onClick={() => {
                            setNote("");
                            setIgnoring(issue);
                          }}
                          className="text-2xs font-semibold text-ink-3 hover:text-ink"
                        >
                          Mettre de côté
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {set.length ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-2xs font-semibold text-ink-3 hover:text-ink">{set.length} point(s) mis de côté</summary>
          <ul className="mt-2 grid gap-2">
            {set.map((issue) => (
              <li key={issue.id} className="rounded-xl border border-line p-3 opacity-75">
                <p className="text-2xs text-ink-2">{issue.message}</p>
                {issue.resolutionNote ? <p className="mt-1 text-2xs text-ink-3">Motif : {issue.resolutionNote}</p> : null}
                <Button size="sm" variant="ghost" className="mt-1 -ml-2" icon={<RotateCcw className="size-3.5" />} onClick={() => reopen.mutate(issue.id)}>
                  Rouvrir
                </Button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <Modal
        open={ignoring !== null}
        onOpenChange={(v) => !v && setIgnoring(null)}
        title="Mettre ce point de côté"
        description={ignoring?.message}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIgnoring(null)}>
              Annuler
            </Button>
            <Button loading={ignore.isPending} disabled={note.trim().length < 3} onClick={() => ignore.mutate()}>
              Mettre de côté
            </Button>
          </>
        }
      >
        <TextareaField label="Motif" rows={3} value={note} onChange={(e) => setNote(e.target.value)} hint="Le motif est conservé au journal ; le point reste écarté tant qu’il ne change pas." />
      </Modal>
    </Card>
  );
}
