import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { type Country, COUNTRY_LABELS, CURRENCY_LABELS, DESIGN_PHASE_LABELS, MARKET_TYPE_LABELS, type Sector, SECTOR_LABELS } from "../../../shared/enums";
import { projectInput } from "../../../shared/schemas";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Dialog";
import { InlineError } from "../../components/ui/Feedback";
import { Field, optionsOf, SelectField, TextareaField } from "../../components/ui/Field";
import { api } from "../../lib/api";
import { toLocalInput } from "../../lib/format";
import { applyServerErrors, text } from "../../lib/forms";
import type { Project } from "../../lib/types";

type Values = z.input<typeof projectInput>;
type Output = z.output<typeof projectInput>;

const CURRENCY_OF: Record<Country, "MAD" | "EUR"> = { MA: "MAD", FR: "EUR" };

function initialValues(project?: Project | null, preset?: { clientId?: string; country?: Country; sector?: Sector }): Values {
  const country = project?.country ?? preset?.country ?? "MA";
  return {
    name: text(project?.name),
    clientId: project?.clientId ?? preset?.clientId ?? "",
    country,
    city: text(project?.city),
    siteAddress: text(project?.siteAddress),
    marketType: project?.marketType ?? "appel_offres_ouvert",
    sector: project?.sector ?? preset?.sector ?? "public",
    worksNature: text(project?.worksNature),
    designPhase: project?.designPhase ?? "dce",
    currency: project?.currency ?? CURRENCY_OF[country],
    submissionDeadline: toLocalInput(project?.submissionDeadline),
    startDate: text(project?.startDate),
    description: text(project?.description),
    hypotheses: text(project?.hypotheses),
    constraints: text(project?.constraints),
    manualEstimate: text(project?.manualEstimate),
  };
}

export function ProjectFormDialog({
  open,
  onOpenChange,
  project,
  client,
  defaults,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: Project | null;
  /** Client actuel de l'affaire (même archivé, il reste proposé). */
  client?: { id: string; name: string } | null;
  defaults?: { clientId?: string; country?: Country; sector?: Sector };
  onSaved?: (project: Project) => void;
}) {
  const queryClient = useQueryClient();
  const [general, setGeneral] = useState<string | null>(null);
  const form = useForm<Values, unknown, Output>({ resolver: zodResolver(projectInput), defaultValues: initialValues(project, defaults) });
  const { register, reset, setError, setValue, handleSubmit, control, formState } = form;
  const errors = formState.errors;
  const currencyTouched = Boolean(formState.dirtyFields.currency);
  const country = useWatch({ control, name: "country" });
  const currency = useWatch({ control, name: "currency" });

  const clients = useQuery({
    queryKey: ["clients", "options"],
    queryFn: ({ signal }) => api<{ items: Array<{ id: string; name: string }> }>("/clients/options", { signal }),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    reset(initialValues(project, defaults));
    setGeneral(null);
    // Les valeurs par défaut ne changent qu'à l'ouverture de la fenêtre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, project, reset]);

  // La devise suit le pays tant qu'elle n'a pas été choisie à la main.
  useEffect(() => {
    if (!project && country && !currencyTouched) setValue("currency", CURRENCY_OF[country]);
  }, [country, project, currencyTouched, setValue]);

  const save = useMutation({
    mutationFn: (data: Output) =>
      project ? api<{ project: Project }>(`/projects/${project.id}`, { method: "PATCH", body: data }) : api<{ project: Project }>("/projects", { body: data }),
    onSuccess: ({ project: saved }) => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      void queryClient.invalidateQueries({ queryKey: ["project", saved.id] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["client"] });
      toast.success(project ? "Affaire mise à jour." : `Affaire ${saved.reference} créée.`);
      onOpenChange(false);
      onSaved?.(saved);
    },
    onError: (error) => setGeneral(applyServerErrors(error, setError)),
  });

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={project ? "Modifier l’affaire" : "Nouvelle affaire"}
      description={project ? project.reference : "La référence est attribuée automatiquement à la création."}
      size="lg"
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
            {project ? "Enregistrer" : "Créer l’affaire"}
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
        <Field label="Intitulé de l’affaire" className="sm:col-span-2" placeholder="Objet du marché ou de l’opération" {...register("name")} error={errors.name?.message} />
        {/* Le champ est monté une fois les clients chargés : sa valeur initiale trouve alors son option. */}
        {clients.data ? (
          <SelectField
            label="Client"
            optional
            placeholder="Aucun client"
            options={[
              ...clients.data.items.map((c) => ({ value: c.id, label: c.name })),
              ...(client && !clients.data.items.some((c) => c.id === client.id) ? [{ value: client.id, label: `${client.name} (archivé)` }] : []),
            ]}
            {...register("clientId")}
            error={errors.clientId?.message}
          />
        ) : (
          <SelectField label="Client" optional placeholder="Chargement…" options={[]} disabled value="" onChange={() => undefined} />
        )}
        <SelectField label="Secteur" options={optionsOf(SECTOR_LABELS)} {...register("sector")} error={errors.sector?.message} />
        <SelectField label="Type de marché" options={optionsOf(MARKET_TYPE_LABELS)} {...register("marketType")} error={errors.marketType?.message} />
        <SelectField label="Phase de conception" options={optionsOf(DESIGN_PHASE_LABELS)} {...register("designPhase")} error={errors.designPhase?.message} />
        <SelectField label="Pays" options={optionsOf(COUNTRY_LABELS)} {...register("country")} error={errors.country?.message} />
        <Field label="Ville" optional {...register("city")} error={errors.city?.message} />
        <Field label="Adresse du site" optional className="sm:col-span-2" {...register("siteAddress")} error={errors.siteAddress?.message} />
        <Field label="Nature des travaux" optional className="sm:col-span-2" placeholder="Construction neuve, réhabilitation, extension…" {...register("worksNature")} error={errors.worksNature?.message} />
        <Field label="Date limite de remise" optional type="datetime-local" {...register("submissionDeadline")} error={errors.submissionDeadline?.message} hint="À votre heure locale." />
        <Field label="Démarrage prévu" optional type="date" {...register("startDate")} error={errors.startDate?.message} />
        <SelectField label="Devise" options={optionsOf(CURRENCY_LABELS)} {...register("currency")} error={errors.currency?.message} />
        <Field
          label={`Estimation (${currency ?? "MAD"})`}
          optional
          inputMode="decimal"
          placeholder="Montant estimé hors taxes"
          {...register("manualEstimate")}
          error={errors.manualEstimate?.message}
          hint="Votre estimation, distincte des montants calculés des DPGF."
        />
        <TextareaField label="Description" optional className="sm:col-span-2" rows={3} {...register("description")} error={errors.description?.message} />
        <TextareaField label="Hypothèses" optional rows={3} {...register("hypotheses")} error={errors.hypotheses?.message} />
        <TextareaField label="Contraintes" optional rows={3} {...register("constraints")} error={errors.constraints?.message} />
      </div>
    </Modal>
  );
}
