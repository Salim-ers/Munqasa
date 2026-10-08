import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, Download, Eye, File as FileIcon, FileImage, FileSpreadsheet, FileText, LoaderCircle, Trash2, UploadCloud, X } from "lucide-react";
import { type DragEvent, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { FILE_KIND_LABELS, FILE_KINDS, type FileKind } from "../../../shared/enums";
import { ALLOWED_EXTENSIONS } from "../../../shared/schemas";
import { FileStatusBadge } from "../../components/StatusBadge";
import { Button } from "../../components/ui/Button";
import { Card, CardHeader } from "../../components/ui/Card";
import { ConfirmDialog } from "../../components/ui/Dialog";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import { optionsOf, SelectField } from "../../components/ui/Field";
import { ActionMenu } from "../../components/ui/Menu";
import { api, errorMessage, query } from "../../lib/api";
import { cn } from "../../lib/cn";
import { formatBytes, formatDateTime } from "../../lib/format";
import type { SourceFile } from "../../lib/types";
import { type UploadItem, useUploads } from "./useUploads";

const ACCEPT = ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",");

function iconFor(name: string, mime: string) {
  if (mime.startsWith("image/") && !/dwg|dxf/.test(mime)) return <FileImage />;
  if (/sheet|excel|csv/.test(mime) || /\.(xlsx?|csv)$/i.test(name)) return <FileSpreadsheet />;
  if (mime === "application/pdf" || /word|text/.test(mime)) return <FileText />;
  return <FileIcon />;
}

const previewable = (f: SourceFile) => f.mimeType === "application/pdf" || /^image\/(png|jpeg|webp)$/.test(f.mimeType);

export function FilesTab({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<FileKind>("plan");
  const [filter, setFilter] = useState<string>("");
  const [deleting, setDeleting] = useState<SourceFile | null>(null);
  const files = useQuery({
    queryKey: ["files", projectId],
    queryFn: ({ signal }) => api<{ items: SourceFile[] }>(`/files${query({ affaire: projectId })}`, { signal }),
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["files", projectId] });
    void queryClient.invalidateQueries({ queryKey: ["project", projectId] });
  };
  const uploads = useUploads(projectId, refresh);

  // Un envoi en cours est signalé avant de quitter la page.
  useEffect(() => {
    if (!uploads.busy) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploads.busy]);

  const all = (files.data?.items ?? []).filter((f) => f.status !== "en_attente");
  const visible = filter ? all.filter((f) => f.kind === filter) : all;
  const kindsPresent = FILE_KINDS.filter((k) => all.some((f) => f.kind === k));

  return (
    <div className="grid gap-4 xl:grid-cols-[22rem_1fr]">
      <Card className="h-fit p-5">
        <CardHeader title="Ajouter des documents" subtitle="Plans, pièces du dossier de consultation, documents techniques" />
        <div className="mt-4 grid gap-4">
          <SelectField label="Type des fichiers déposés" options={optionsOf(FILE_KIND_LABELS)} value={kind} onChange={(e) => setKind(e.target.value as FileKind)} />
          <DropZone onFiles={(list) => uploads.add(list, kind)} />
          <p className="text-2xs leading-relaxed text-ink-3">
            PDF, images, DWG, DXF, IFC, ZIP, Word, Excel, CSV ou texte, 500 Mo au plus par fichier. Le type réel de chaque fichier est vérifié à la réception, et les fichiers restent privés.
          </p>
        </div>
        {uploads.items.length ? (
          <div className="mt-5 border-t border-line pt-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-2xs font-semibold tracking-wide text-ink-3 uppercase">Envois</p>
              {!uploads.busy ? (
                <button type="button" onClick={uploads.clearFinished} className="text-2xs font-semibold text-ink-3 hover:text-ink">
                  Effacer la liste
                </button>
              ) : null}
            </div>
            <ul className="grid gap-2">
              {uploads.items.map((item) => (
                <UploadRow key={item.key} item={item} onCancel={() => uploads.cancel(item.key)} />
              ))}
            </ul>
          </div>
        ) : null}
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 p-5 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <CardHeader title="Documents de l’affaire" subtitle={files.data ? `${all.length} fichier${all.length > 1 ? "s" : ""}` : undefined} />
          {kindsPresent.length > 1 ? (
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              aria-label="Filtrer par type"
              className="h-9 rounded-xl border border-line bg-surface px-3 text-xs font-medium text-ink-2 outline-none focus:border-accent"
            >
              <option value="">Tous les types</option>
              {kindsPresent.map((k) => (
                <option key={k} value={k}>
                  {FILE_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          ) : null}
        </div>
        {files.isPending ? (
          <div className="grid gap-2 px-5 pb-5">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : visible.length === 0 ? (
          <EmptyState icon={<UploadCloud className="size-5" />} title="Aucun document" text="Déposez les plans et les pièces du dossier : ils seront la source des métrés, du CCTP et de la DPGF." />
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {visible.map((f) => (
              <li key={f.id} className="flex items-center gap-3 px-5 py-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-2 [&_svg]:size-4 [&_svg]:stroke-[1.75]">{iconFor(f.originalName, f.mimeType)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-ink" title={f.originalName}>
                    {f.originalName}
                  </p>
                  <p className="truncate text-2xs text-ink-3">
                    {[FILE_KIND_LABELS[f.kind], formatBytes(f.sizeBytes), formatDateTime(f.uploadedAt ?? f.createdAt)].filter(Boolean).join(", ")}
                  </p>
                  {f.status === "rejete" && f.error ? <p className="mt-0.5 text-2xs text-danger">{f.error}</p> : null}
                </div>
                <div className="hidden sm:block">
                  <FileStatusBadge status={f.status} />
                </div>
                {f.status !== "rejete" ? (
                  <a
                    href={`/api/admin/files/${f.id}/download`}
                    className="hidden size-8 place-items-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink sm:grid"
                    aria-label={`Télécharger ${f.originalName}`}
                  >
                    <Download className="size-4" aria-hidden="true" />
                  </a>
                ) : null}
                <ActionMenu
                  actions={[
                    ...(f.status !== "rejete" && previewable(f)
                      ? [{ label: "Aperçu", icon: <Eye />, onSelect: () => window.open(`/api/admin/files/${f.id}/download?apercu=1`, "_blank", "noopener") }]
                      : []),
                    ...(f.status !== "rejete" ? [{ label: "Télécharger", icon: <Download />, onSelect: () => window.location.assign(`/api/admin/files/${f.id}/download`) }] : []),
                    { label: "Supprimer", icon: <Trash2 />, tone: "danger" as const, onSelect: () => setDeleting(f) },
                  ]}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Supprimer ce fichier ?"
        text={deleting ? `« ${deleting.originalName} » sera effacé du stockage. Cette suppression est définitive ; elle reste tracée au journal.` : ""}
        confirmLabel="Supprimer définitivement"
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await api(`/files/${deleting.id}`, { method: "DELETE" });
            toast.success("Fichier supprimé.");
            refresh();
          } catch (error) {
            toast.error(errorMessage(error));
            throw error;
          }
        }}
      />
    </div>
  );
}

function DropZone({ onFiles }: { onFiles: (files: FileList) => void }) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const depth = useRef(0);

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    depth.current = 0;
    setOver(false);
    if (event.dataTransfer.files.length) onFiles(event.dataTransfer.files);
  };

  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault();
        depth.current++;
        setOver(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(false);
      }}
      onDrop={onDrop}
      className={cn("relative rounded-xl border-2 border-dashed transition-colors", over ? "border-accent bg-accent-soft" : "border-line-strong hover:border-accent/60 hover:bg-surface-2")}
    >
      <label htmlFor={inputId} className="flex cursor-pointer flex-col items-center gap-2 px-4 py-8 text-center">
        <span className={cn("grid size-11 place-items-center rounded-xl transition-colors", over ? "bg-accent text-on-accent" : "bg-surface-2 text-ink-2")}>
          <UploadCloud className="size-5" aria-hidden="true" />
        </span>
        <span className="text-xs font-semibold text-ink">{over ? "Déposez pour envoyer" : "Glissez vos fichiers ici"}</span>
        <span className="text-2xs text-ink-3">ou touchez pour les choisir</span>
      </label>
      <input
        ref={input}
        id={inputId}
        type="file"
        multiple
        accept={ACCEPT}
        className="sr-only"
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function UploadRow({ item, onCancel }: { item: UploadItem; onCancel: () => void }) {
  const label =
    item.stage === "attente" ? "En attente" : item.stage === "envoi" ? `${Math.round(item.progress * 100)} %` : item.stage === "verification" ? "Vérification" : item.stage === "termine" ? "Vérifié" : "Échec";
  return (
    <li className="rounded-xl border border-line p-3">
      <div className="flex items-center gap-2.5">
        <span className={cn("shrink-0 [&_svg]:size-4", item.stage === "termine" ? "text-success" : item.stage === "erreur" ? "text-danger" : "text-ink-3")}>
          {item.stage === "termine" ? <CircleCheck /> : item.stage === "erreur" ? <CircleAlert /> : <LoaderCircle className="animate-spin" />}
        </span>
        <p className="min-w-0 flex-1 truncate text-xs font-medium text-ink" title={item.name}>
          {item.name}
        </p>
        <span className="shrink-0 text-2xs font-semibold text-ink-3 tabular">{label}</span>
        {item.stage === "attente" || item.stage === "envoi" ? (
          <Button variant="ghost" size="sm" className="size-7 px-0" onClick={onCancel} aria-label={`Annuler l’envoi de ${item.name}`}>
            <X className="size-3.5" aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      {item.stage === "envoi" || item.stage === "verification" ? (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={Math.round(item.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`Envoi de ${item.name}`}>
          <div className={cn("h-full rounded-full bg-accent transition-[width] duration-200", item.stage === "verification" && "animate-pulse")} style={{ width: `${Math.max(4, item.progress * 100)}%` }} />
        </div>
      ) : null}
      {item.message ? <p className={cn("mt-1.5 text-2xs", item.stage === "erreur" ? "text-danger" : "text-ink-3")}>{item.message}</p> : null}
      <p className="mt-0.5 text-2xs text-ink-3">{[FILE_KIND_LABELS[item.kind], formatBytes(item.size)].join(", ")}</p>
    </li>
  );
}
