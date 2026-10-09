/** Traitements des agents : suivi en direct, annulation, reprise. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import type { JobKind, JobStatus, StepStatus } from "../../shared/enums";
import { api, query } from "./api";

export interface JobStep {
  id: string;
  name: string;
  label: string;
  status: StepStatus;
  attempts: number;
  error: string | null;
  log: Array<{ at: string; message: string }>;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface Job {
  id: string;
  kind: JobKind;
  title: string;
  projectId: string | null;
  status: JobStatus;
  error: string | null;
  stalled: boolean;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  progress: { done: number; total: number };
  steps: JobStep[];
  project?: { id: string; reference: string; name: string } | null;
}

export interface AgentStatus {
  simulation: boolean;
  openaiKey: boolean;
  generationModel: string | null;
  extractionModel: string | null;
  storage: boolean;
  monthUsd: string;
  budgetUsd: string | null;
  /** Prix utilisables de la bibliothèque (ni archivés ni rejetés), dont vérifiés. */
  prices: number;
  verifiedPrices: number;
}

export const isActive = (job: Pick<Job, "status">) => job.status === "en_attente" || job.status === "en_cours";

export function useAgentStatus() {
  return useQuery({ queryKey: ["agents", "status"], queryFn: ({ signal }) => api<AgentStatus>("/agents/status", { signal }), staleTime: 30_000 });
}

/**
 * Liste des traitements (d'une affaire ou de tous), actualisée tant que l'un d'eux est actif.
 * Un traitement interrompu est relancé une fois ; à la fin d'un traitement, les données qu'il a
 * produites (planches, métré, documents) et les notifications sont rechargées.
 */
export function useJobs(projectId?: string) {
  const queryClient = useQueryClient();
  const jobs = useQuery({
    queryKey: ["jobs", projectId ?? "tous"],
    queryFn: ({ signal }) => api<{ items: Job[] }>(`/agents/jobs${query({ affaire: projectId, limit: 20 })}`, { signal }),
    refetchInterval: (q) => (q.state.data?.items.some(isActive) ? 2500 : false),
  });
  const statuses = useRef(new Map<string, JobStatus>());
  const resumed = useRef(new Set<string>());
  const mountedAt = useRef(Date.now());
  const items = jobs.data?.items;
  useEffect(() => {
    if (!items) return;
    for (const job of items) {
      const before = statuses.current.get(job.id);
      // Fin observée, ou traitement si rapide qu'il est déjà terminé à sa première apparition.
      const justFinished = before ? isActive({ status: before }) && !isActive(job) : !isActive(job) && job.finishedAt !== null && new Date(job.finishedAt).getTime() > mountedAt.current;
      if (justFinished) {
        if (job.projectId) void queryClient.invalidateQueries({ queryKey: ["project", job.projectId] });
        void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      }
      statuses.current.set(job.id, job.status);
      if (job.stalled && isActive(job) && !resumed.current.has(job.id)) {
        resumed.current.add(job.id);
        void api(`/agents/jobs/${job.id}/resume`, { body: {} }).catch(() => undefined);
      }
    }
  }, [items, queryClient]);
  return jobs;
}

export function useJobAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: "cancel" | "retry" }) => api<{ job: Job }>(`/agents/jobs/${id}/${action}`, { body: {} }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["jobs"] }),
  });
}
