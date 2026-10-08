/**
 * File d'envoi des fichiers : demande d'URL signée, envoi direct avec progression, vérification
 * par le serveur (type réel, taille, empreinte). Deux envois au plus en parallèle.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { FileKind } from "../../../shared/enums";
import { ALLOWED_EXTENSIONS, MAX_UPLOAD_BYTES } from "../../../shared/schemas";
import { api, errorMessage, sendFile } from "../../lib/api";
import type { SourceFile } from "../../lib/types";

export type UploadStage = "attente" | "envoi" | "verification" | "termine" | "erreur";

export interface UploadItem {
  key: string;
  name: string;
  size: number;
  kind: FileKind;
  progress: number;
  stage: UploadStage;
  message?: string;
}

interface Job {
  key: string;
  file: File;
  kind: FileKind;
  controller: AbortController;
}

const MAX_PARALLEL = 2;

function precheck(file: File): string | null {
  const ext = /\.([a-z0-9]{1,8})$/i.exec(file.name)?.[1]?.toLowerCase() ?? "";
  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) return `Format non accepté${ext ? ` (.${ext})` : ""}.`;
  if (file.size === 0) return "Fichier vide.";
  if (file.size > MAX_UPLOAD_BYTES) return "Fichier trop volumineux (500 Mo au plus).";
  return null;
}

export function useUploads(projectId: string | null, onFinished: () => void) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const queue = useRef<Job[]>([]);
  const active = useRef(new Map<string, Job>());
  const finished = useRef(onFinished);
  finished.current = onFinished;

  const update = useCallback((key: string, patch: Partial<UploadItem>) => {
    setItems((list) => list.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }, []);

  const pump = useCallback(() => {
    while (active.current.size < MAX_PARALLEL && queue.current.length > 0) {
      const job = queue.current.shift()!;
      active.current.set(job.key, job);
      void (async () => {
        update(job.key, { stage: "envoi" });
        try {
          const { file: record, upload } = await api<{ file: SourceFile; upload: { method: string; url: string; headers: Record<string, string> } }>("/files/upload-url", {
            body: { projectId, kind: job.kind, fileName: job.file.name, sizeBytes: job.file.size, contentType: job.file.type },
          });
          await sendFile(upload, job.file, (ratio) => update(job.key, { progress: ratio }), job.controller.signal);
          update(job.key, { stage: "verification", progress: 1 });
          const result = await api<{ file: SourceFile; duplicateOf?: string | null }>(`/files/${record.id}/complete`, { body: {} });
          update(job.key, { stage: "termine", message: result.duplicateOf ? `Contenu identique à « ${result.duplicateOf} », déjà présent.` : undefined });
        } catch (error) {
          update(job.key, { stage: "erreur", message: errorMessage(error) });
        } finally {
          active.current.delete(job.key);
          finished.current();
          pump();
        }
      })();
    }
  }, [projectId, update]);

  const add = useCallback(
    (files: FileList | File[], kind: FileKind) => {
      const added: UploadItem[] = [];
      for (const file of Array.from(files)) {
        const key = crypto.randomUUID();
        const problem = precheck(file);
        added.push({ key, name: file.name, size: file.size, kind, progress: 0, stage: problem ? "erreur" : "attente", message: problem ?? undefined });
        if (!problem) queue.current.push({ key, file, kind, controller: new AbortController() });
      }
      setItems((list) => [...added, ...list]);
      pump();
    },
    [pump],
  );

  const cancel = useCallback((key: string) => {
    const job = active.current.get(key) ?? queue.current.find((j) => j.key === key);
    queue.current = queue.current.filter((j) => j.key !== key);
    if (job) job.controller.abort();
    setItems((list) => list.map((item) => (item.key === key && item.stage !== "termine" ? { ...item, stage: "erreur", message: "Envoi annulé." } : item)));
  }, []);

  const clearFinished = useCallback(() => setItems((list) => list.filter((item) => item.stage !== "termine" && item.stage !== "erreur")), []);

  // Quitter la page interrompt les envois en cours.
  useEffect(() => {
    const running = active.current;
    return () => {
      for (const job of running.values()) job.controller.abort();
      queue.current = [];
    };
  }, []);

  const busy = items.some((item) => item.stage === "attente" || item.stage === "envoi" || item.stage === "verification");
  return { items, add, cancel, clearFinished, busy };
}
