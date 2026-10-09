import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Download, History, ListChecks, Pencil, RotateCcw, Save, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DOCUMENT_STATUS_LABELS, SECTION_STATUS_LABELS } from "../../../shared/enums";
import { QualityPanel } from "../../components/QualityPanel";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card, CardHeader } from "../../components/ui/Card";
import { ConfirmDialog, Modal } from "../../components/ui/Dialog";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import { Checkbox, Field, TextareaField } from "../../components/ui/Field";
import { api, errorMessage } from "../../lib/api";
import { cn } from "../../lib/cn";
import { formatDateTime } from "../../lib/format";
import type { CctpBlock, CctpDetail, CctpSection, TechnicalReference } from "../../lib/types";
import { ArticleEditDialog } from "./ArticleEditDialog";

const sectionTone = { a_rediger: "neutral", genere: "accent", a_valider: "warning", valide: "success" } as const;
const documentTone = { brouillon: "neutral", en_generation: "accent", a_valider: "warning", valide: "success", archive: "neutral" } as const;

function Blocks({ blocks, references }: { blocks: CctpBlock[]; references: Map<string, TechnicalReference> }) {
  return (
    <div className="grid gap-2.5 text-xs leading-relaxed text-ink-2">
      {blocks.map((b, i) =>
        b.type === "liste" ? (
          <ol key={i} className="grid list-[lower-alpha] gap-1 pl-5 marker:text-ink-3">
            {b.items.map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </ol>
        ) : b.type === "exigence" ? (
          <p key={i} className="rounded-r-lg border-l-2 border-accent bg-accent-soft/60 py-2 pr-3 pl-3 text-ink">
            {b.text}
          </p>
        ) : b.type === "note" ? (
          <p key={i} className="text-ink-3 italic">
            Note : {b.text}
          </p>
        ) : (
          <p key={i} className="sm:text-justify">
            {b.text}
          </p>
        ),
      )}
      {(() => {
        const ids = [...new Set(blocks.flatMap((b) => b.referenceIds))];
        if (!ids.length) return null;
        return (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {ids.map((id) => {
              const ref = references.get(id);
              return ref ? (
                <Badge key={id} tone={ref.verificationStatus === "verifie" ? "neutral" : "warning"}>
                  {ref.code}
                  {ref.verificationStatus === "verifie" ? "" : ", à vérifier"}
                </Badge>
              ) : null;
            })}
          </div>
        );
      })()}
    </div>
  );
}

/** CCTP : plan, articles, validation article par article, réécriture ciblée, contrôle qualité, versions, export. */
export function CctpDocumentView({ projectId, documentId, onBack }: { projectId: string; documentId: string; onBack: () => void }) {
  const queryClient = useQueryClient();
  const key = ["project", projectId, "cctp", documentId];
  const detail = useQuery({ queryKey: key, queryFn: ({ signal }) => api<CctpDetail>(`/cctp/${documentId}`, { signal }) });
  const [editing, setEditing] = useState<CctpSection | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [rewriteOpen, setRewriteOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["project", projectId] });

  const validateArticle = useMutation({
    mutationFn: ({ id, validated }: { id: string; validated: boolean }) => api(`/cctp/sections/${id}/validate`, { body: { validated } }),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const validateDocument = useMutation({
    mutationFn: () => api<{ version: number }>(`/cctp/${documentId}/validate`, { body: {} }),
    onSuccess: (r) => {
      toast.success(`Document validé, version ${r.version} figée.`);
      refresh();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      refresh();
    },
  });
  const check = useMutation({ mutationFn: () => api(`/cctp/${documentId}/check`, { body: {} }), onSuccess: refresh });

  if (detail.isPending) return <Skeleton className="h-96" />;
  if (detail.isError || !detail.data) return <Card className="p-6"><EmptyState title="CCTP indisponible" text={errorMessage(detail.error)} /></Card>;

  const { document, sections, references, issues, versions } = detail.data;
  const refMap = new Map(references.map((r) => [r.id, r]));
  const allowedRefs = references.filter((r) => document.referenceIds.includes(r.id));
  const articles = sections.filter((s) => s.kind === "article");
  const validated = articles.filter((a) => a.status === "valide").length;
  const blocking = issues.some((i) => i.status === "ouverte" && i.severity === "bloquante");
  const scrollTo = (id: string) => window.document.getElementById(`article-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" icon={<ArrowLeft className="size-3.5" />} onClick={onBack}>
          Documents du lot
        </Button>
        <span className="flex-1" />
        <a
          href={`/api/admin/cctp/${documentId}/export.docx`}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-xs font-semibold text-ink hover:bg-surface-2"
        >
          <Download className="size-3.5" aria-hidden="true" />
          Exporter en Word
        </a>
        <Button variant="secondary" size="sm" icon={<Save className="size-3.5" />} onClick={() => setVersionOpen(true)}>
          Enregistrer une version
        </Button>
        <Button size="sm" icon={<ShieldCheck className="size-3.5" />} loading={validateDocument.isPending} disabled={blocking || document.status === "valide"} onClick={() => validateDocument.mutate()}>
          {document.status === "valide" ? "Document validé" : "Valider le document"}
        </Button>
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight text-ink">{document.title}</h2>
            <p className="mt-0.5 text-2xs text-ink-3">
              {[detail.data.lot ? `Lot ${detail.data.lot.code} ${detail.data.lot.name}` : null, `${articles.length} articles, ${validated} validé(s)`, `version ${document.currentVersion}`].filter(Boolean).join(", ")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={documentTone[document.status]} dot>
              {DOCUMENT_STATUS_LABELS[document.status]}
            </Badge>
            <Button variant={selecting ? "dark" : "ghost"} size="sm" icon={<ListChecks className="size-3.5" />} onClick={() => (selecting ? (setSelecting(false), setSelected([])) : setSelecting(true))}>
              {selecting ? "Terminer la sélection" : "Réécrire des articles"}
            </Button>
          </div>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={articles.length ? Math.round((validated / articles.length) * 100) : 0} aria-valuemin={0} aria-valuemax={100} aria-label="Articles validés">
          <div className="h-full rounded-full bg-success transition-[width]" style={{ width: `${articles.length ? (validated / articles.length) * 100 : 0}%` }} />
        </div>
        {selecting ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-surface-2 p-3 text-xs text-ink-2">
            <span>{selected.length} article(s) sélectionné(s)</span>
            <span className="flex-1" />
            <Button size="sm" icon={<Sparkles className="size-3.5" />} disabled={!selected.length} onClick={() => setRewriteOpen(true)}>
              Réécrire avec l’agent
            </Button>
          </div>
        ) : null}
      </Card>

      <div className="grid gap-4 xl:grid-cols-[15rem_1fr_20rem]">
        <Card className="h-fit p-4 xl:sticky xl:top-20">
          <details open className="group">
            <summary className="cursor-pointer list-none text-2xs font-semibold tracking-wide text-ink-3 uppercase">Plan</summary>
            <nav className="mt-3 grid max-h-[65vh] gap-0.5 overflow-y-auto" aria-label="Plan du CCTP">
              {sections.map((s) =>
                s.kind === "chapitre" ? (
                  <p key={s.id} className="mt-2 text-2xs font-semibold text-ink first:mt-0">
                    {s.number} {s.title}
                  </p>
                ) : (
                  <button key={s.id} type="button" onClick={() => scrollTo(s.id)} className="flex items-center gap-2 rounded-lg px-2 py-1 text-left text-2xs text-ink-2 hover:bg-surface-2 hover:text-ink">
                    <span className={cn("size-1.5 shrink-0 rounded-full", s.status === "valide" ? "bg-success" : s.status === "a_rediger" ? "bg-ink-3" : s.status === "a_valider" ? "bg-warning" : "bg-accent")} aria-hidden="true" />
                    <span className="truncate">
                      {s.number} {s.title}
                    </span>
                  </button>
                ),
              )}
            </nav>
          </details>
        </Card>

        <div className="grid min-w-0 content-start gap-3">
          {sections.map((s) =>
            s.kind === "chapitre" ? (
              <h3 key={s.id} className="mt-2 font-serif text-xl text-ink first:mt-0">
                {s.number} {s.title}
              </h3>
            ) : (
              <Card key={s.id} id={`article-${s.id}`} className={cn("scroll-mt-24 p-5", selected.includes(s.id) && "ring-2 ring-accent")}>
                <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                  {selecting ? (
                    <Checkbox label={<span className="sr-only">Sélectionner l’article {s.number}</span>} checked={selected.includes(s.id)} onChange={(v) => setSelected((list) => (v ? [...list, s.id] : list.filter((id) => id !== s.id)))} />
                  ) : null}
                  <h4 className="min-w-0 flex-1 text-sm font-semibold text-ink">
                    {s.number} {s.title}
                  </h4>
                  <Badge tone={sectionTone[s.status]} dot>
                    {SECTION_STATUS_LABELS[s.status]}
                  </Badge>
                </div>
                {s.intent ? <p className="mt-1 text-2xs text-ink-3">Objet : {s.intent}</p> : null}
                <div className="mt-3">
                  {s.content.length ? <Blocks blocks={s.content} references={refMap} /> : <p className="text-xs text-ink-3 italic">Article à rédiger.</p>}
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5 border-t border-line pt-3">
                  {s.status !== "valide" ? (
                    <Button size="sm" variant="ghost" icon={<Check className="size-3.5" />} disabled={!s.content.length} onClick={() => validateArticle.mutate({ id: s.id, validated: true })}>
                      Valider
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} onClick={() => validateArticle.mutate({ id: s.id, validated: false })}>
                      À revoir
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(s)}>
                    Modifier
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Sparkles className="size-3.5" />}
                    onClick={() => {
                      setSelected([s.id]);
                      setRewriteOpen(true);
                    }}
                  >
                    Réécrire
                  </Button>
                </div>
              </Card>
            ),
          )}
        </div>

        <div className="grid content-start gap-4">
          <QualityPanel issues={issues} onChanged={refresh} onSelectTarget={scrollTo} />
          <Button variant="ghost" size="sm" className="justify-self-start" loading={check.isPending} onClick={() => check.mutate()}>
            Relancer le contrôle
          </Button>
          <Card className="p-5">
            <CardHeader title="Versions" subtitle="Instantanés figés, jamais modifiés" />
            <ul className="mt-3 grid gap-2">
              {[...versions].reverse().map((v) => (
                <li key={v.id} className="flex items-start gap-2.5 text-2xs">
                  <History className="mt-0.5 size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink">
                      Version {v.version} {v.validated ? <Badge tone="success">Validée</Badge> : null}
                    </p>
                    <p className="text-ink-3">{[v.note, formatDateTime(v.createdAt)].filter(Boolean).join(", ")}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
          <Button variant="danger" size="sm" className="justify-self-start" icon={<Trash2 className="size-3.5" />} onClick={() => setDeleting(true)}>
            Supprimer ce CCTP
          </Button>
        </div>
      </div>

      <ArticleEditDialog section={editing} references={allowedRefs} onOpenChange={(open) => !open && setEditing(null)} onSaved={refresh} />
      <RewriteDialog
        open={rewriteOpen}
        onOpenChange={setRewriteOpen}
        documentId={documentId}
        sectionIds={selected}
        labels={articles.filter((a) => selected.includes(a.id)).map((a) => `${a.number} ${a.title}`)}
        onStarted={() => {
          setSelecting(false);
          setSelected([]);
          void queryClient.invalidateQueries({ queryKey: ["jobs"] });
        }}
      />
      <VersionDialog open={versionOpen} onOpenChange={setVersionOpen} documentId={documentId} onSaved={refresh} />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Supprimer ce CCTP ?"
        text={`« ${document.title} », ses versions et ses points de contrôle seront supprimés. Le métré et les plans ne sont pas touchés.`}
        confirmLabel="Supprimer"
        onConfirm={async () => {
          try {
            await api(`/cctp/${documentId}`, { method: "DELETE" });
            toast.success("CCTP supprimé.");
            refresh();
            onBack();
          } catch (error) {
            toast.error(errorMessage(error));
            throw error;
          }
        }}
      />
    </div>
  );
}

function RewriteDialog({ open, onOpenChange, documentId, sectionIds, labels, onStarted }: { open: boolean; onOpenChange: (v: boolean) => void; documentId: string; sectionIds: string[]; labels: string[]; onStarted: () => void }) {
  const [instructions, setInstructions] = useState("");
  const [consent, setConsent] = useState(false);
  const rewrite = useMutation({
    mutationFn: () => api(`/cctp/${documentId}/rewrite`, { body: { sectionIds, instructions: instructions || null, consent } }),
    onSuccess: () => {
      toast.success("Réécriture lancée : suivez-la dans les traitements du CCTP.");
      setInstructions("");
      setConsent(false);
      onOpenChange(false);
      onStarted();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Réécrire avec l’agent"
      description={labels.join(" ; ")}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button loading={rewrite.isPending} disabled={!consent || !sectionIds.length} onClick={() => rewrite.mutate()}>
            Réécrire
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <TextareaField label="Consigne" optional rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Préciser les tolérances, alléger, reprendre la terminologie du maître d’ouvrage…" />
        <Checkbox label="J’accepte que les informations de l’affaire et ces articles soient transmis à l’API OpenAI." checked={consent} onChange={setConsent} />
      </div>
    </Modal>
  );
}

function VersionDialog({ open, onOpenChange, documentId, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; documentId: string; onSaved: () => void }) {
  const [note, setNote] = useState("");
  const save = useMutation({
    mutationFn: () => api<{ version: number }>(`/cctp/${documentId}/versions`, { body: { note } }),
    onSuccess: (r) => {
      toast.success(`Version ${r.version} enregistrée.`);
      setNote("");
      onOpenChange(false);
      onSaved();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Enregistrer une version"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Enregistrer
          </Button>
        </>
      }
    >
      <Field label="Note" optional value={note} onChange={(e) => setNote(e.target.value)} placeholder="Avant relecture du bureau de contrôle" maxLength={300} />
    </Modal>
  );
}
