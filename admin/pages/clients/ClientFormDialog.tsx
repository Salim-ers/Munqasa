import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { COUNTRY_LABELS, SECTOR_LABELS } from "../../../shared/enums";
import { clientInput, LEGAL_ID_FIELDS } from "../../../shared/schemas";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Dialog";
import { InlineError } from "../../components/ui/Feedback";
import { Field, optionsOf, SelectField, TextareaField } from "../../components/ui/Field";
import { api } from "../../lib/api";
import { applyServerErrors, text } from "../../lib/forms";
import type { Client } from "../../lib/types";

type Values = z.input<typeof clientInput>;
type Output = z.output<typeof clientInput>;

function defaults(client?: Client | null): Values {
  return {
    name: text(client?.name),
    sector: client?.sector ?? "prive",
    legalForm: text(client?.legalForm),
    country: client?.country ?? "MA",
    city: text(client?.city),
    address: text(client?.address),
    contactName: text(client?.contactName),
    email: text(client?.email),
    phone: text(client?.phone),
    legalIds: { ...(client?.legalIds ?? {}) },
    notes: text(client?.notes),
  };
}

export function ClientFormDialog({ open, onOpenChange, client, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; client?: Client | null; onSaved?: (client: Client) => void }) {
  const queryClient = useQueryClient();
  const [general, setGeneral] = useState<string | null>(null);
  const form = useForm<Values, unknown, Output>({ resolver: zodResolver(clientInput), defaultValues: defaults(client) });
  const { register, reset, setError, handleSubmit, control, formState } = form;
  const errors = formState.errors;
  const country = useWatch({ control, name: "country" });

  useEffect(() => {
    if (!open) return;
    reset(defaults(client));
    setGeneral(null);
  }, [open, client, reset]);

  const save = useMutation({
    mutationFn: (data: Output) => {
      // Seuls les identifiants du pays choisi sont conservés.
      const keys: string[] = LEGAL_ID_FIELDS[data.country].map((f) => f.key);
      const body = { ...data, legalIds: Object.fromEntries(Object.entries(data.legalIds).filter(([k]) => keys.includes(k))) };
      return client ? api<{ client: Client }>(`/clients/${client.id}`, { method: "PATCH", body }) : api<{ client: Client }>("/clients", { body });
    },
    onSuccess: ({ client: saved }) => {
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
      void queryClient.invalidateQueries({ queryKey: ["client", saved.id] });
      toast.success(client ? "Client mis à jour." : "Client créé.");
      onOpenChange(false);
      onSaved?.(saved);
    },
    onError: (error) => setGeneral(applyServerErrors(error, setError)),
  });

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={client ? "Modifier le client" : "Nouveau client"}
      description="Maître d’ouvrage public ou privé. Les coordonnées servent aux affaires et aux devis."
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
            {client ? "Enregistrer" : "Créer le client"}
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
        <Field label="Nom ou raison sociale" className="sm:col-span-2" autoComplete="organization" {...register("name")} error={errors.name?.message} />
        <SelectField label="Secteur" options={optionsOf(SECTOR_LABELS)} {...register("sector")} error={errors.sector?.message} />
        <Field label="Forme juridique" optional placeholder="SA, SARL, établissement public…" {...register("legalForm")} error={errors.legalForm?.message} />
        <SelectField label="Pays" options={optionsOf(COUNTRY_LABELS)} {...register("country")} error={errors.country?.message} />
        <Field label="Ville" optional autoComplete="address-level2" {...register("city")} error={errors.city?.message} />
        <Field label="Adresse" optional className="sm:col-span-2" autoComplete="street-address" {...register("address")} error={errors.address?.message} />
        <Field label="Interlocuteur" optional autoComplete="name" {...register("contactName")} error={errors.contactName?.message} />
        <Field label="Téléphone" optional type="tel" autoComplete="tel" {...register("phone")} error={errors.phone?.message} />
        <Field label="E-mail" optional type="email" className="sm:col-span-2" autoComplete="email" {...register("email")} error={errors.email?.message} />

        <fieldset className="grid gap-4 rounded-xl border border-line p-4 sm:col-span-2 sm:grid-cols-2">
          <legend className="px-1 text-2xs font-semibold tracking-wide text-ink-3 uppercase">Identifiants légaux</legend>
          {(LEGAL_ID_FIELDS[country ?? "MA"] ?? []).map((f) => (
            <Field key={`${country}-${f.key}`} label={f.label} optional {...register(`legalIds.${f.key}`)} />
          ))}
        </fieldset>

        <TextareaField label="Notes" optional className="sm:col-span-2" rows={3} {...register("notes")} error={errors.notes?.message} />
      </div>
    </Modal>
  );
}
