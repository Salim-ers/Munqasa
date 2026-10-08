import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { DEADLINE_KIND_LABELS } from "../../../shared/enums";
import { deadlineInput } from "../../../shared/schemas";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Dialog";
import { InlineError } from "../../components/ui/Feedback";
import { Field, optionsOf, SelectField, TextareaField } from "../../components/ui/Field";
import { api, query } from "../../lib/api";
import { toLocalInput } from "../../lib/format";
import { applyServerErrors, text } from "../../lib/forms";
import type { Deadline, Paged, ProjectRow } from "../../lib/types";

type Values = z.input<typeof deadlineInput>;
type Output = z.output<typeof deadlineInput>;

function initialValues(deadline?: Deadline | null, projectId?: string | null): Values {
  return {
    projectId: deadline?.projectId ?? projectId ?? "",
    title: text(deadline?.title),
    kind: deadline?.kind ?? "jalon",
    dueAt: toLocalInput(deadline?.dueAt),
    notes: text(deadline?.notes),
  };
}

/** Échéance : rattachée à une affaire (fixée) ou libre, avec choix de l'affaire. */
export function DeadlineFormDialog({ open, onOpenChange, deadline, projectId }: { open: boolean; onOpenChange: (open: boolean) => void; deadline?: Deadline | null; projectId?: string }) {
  const queryClient = useQueryClient();
  const [general, setGeneral] = useState<string | null>(null);
  const form = useForm<Values, unknown, Output>({ resolver: zodResolver(deadlineInput), defaultValues: initialValues(deadline, projectId) });
  const { register, reset, setError, handleSubmit, formState } = form;
  const errors = formState.errors;
  const fixedProject = Boolean(projectId);

  const projects = useQuery({
    queryKey: ["projects", "options"],
    queryFn: ({ signal }) => api<Paged<ProjectRow>>(`/projects${query({ pageSize: 100, sort: "nom", dir: "asc" })}`, { signal }),
    enabled: open && !fixedProject,
  });

  useEffect(() => {
    if (!open) return;
    reset(initialValues(deadline, projectId));
    setGeneral(null);
  }, [open, deadline, projectId, reset]);

  const save = useMutation({
    mutationFn: (data: Output) =>
      deadline ? api<{ deadline: Deadline }>(`/deadlines/${deadline.id}`, { method: "PATCH", body: data }) : api<{ deadline: Deadline }>("/deadlines", { body: data }),
    onSuccess: ({ deadline: saved }) => {
      void queryClient.invalidateQueries({ queryKey: ["deadlines"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      if (saved.projectId) void queryClient.invalidateQueries({ queryKey: ["project", saved.projectId] });
      toast.success(deadline ? "Échéance mise à jour." : "Échéance ajoutée.");
      onOpenChange(false);
    },
    onError: (error) => setGeneral(applyServerErrors(error, setError)),
  });

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={deadline ? "Modifier l’échéance" : "Nouvelle échéance"}
      description="Les rappels sont envoyés dans les notifications aux seuils définis dans les réglages d’alerte."
      onSubmit={handleSubmit((data) => {
        setGeneral(null);
        save.mutate(data);
      })}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="submit" loading={save.isPending}>
            {deadline ? "Enregistrer" : "Ajouter"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {general ? (
          <div className="sm:col-span-2">
            <InlineError>{general}</InlineError>
          </div>
        ) : null}
        <Field label="Intitulé" className="sm:col-span-2" placeholder="Visite des lieux, séance d’ouverture des plis…" {...register("title")} error={errors.title?.message} />
        <SelectField label="Type" options={optionsOf(DEADLINE_KIND_LABELS)} {...register("kind")} error={errors.kind?.message} />
        <Field label="Date et heure" type="datetime-local" {...register("dueAt")} error={errors.dueAt?.message} />
        {fixedProject ? null : projects.data ? (
          <SelectField
            label="Affaire"
            optional
            className="sm:col-span-2"
            placeholder="Sans affaire"
            options={[
              ...projects.data.items.map((p) => ({ value: p.id, label: `${p.reference}, ${p.name}` })),
              // Affaire archivée ou hors liste : l'échéance garde son rattachement.
              ...(deadline?.projectId && !projects.data.items.some((p) => p.id === deadline.projectId)
                ? [{ value: deadline.projectId, label: [deadline.projectReference, deadline.projectName].filter(Boolean).join(", ") || "Affaire rattachée" }]
                : []),
            ]}
            {...register("projectId")}
            error={errors.projectId?.message}
          />
        ) : (
          <SelectField label="Affaire" optional className="sm:col-span-2" placeholder="Chargement…" options={[]} disabled value="" onChange={() => undefined} />
        )}
        <TextareaField label="Notes" optional className="sm:col-span-2" rows={3} {...register("notes")} error={errors.notes?.message} />
      </div>
    </Modal>
  );
}
