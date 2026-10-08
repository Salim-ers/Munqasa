import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building, Pencil, Plus, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { COUNTRY_LABELS, CURRENCY_LABELS } from "../../../shared/enums";
import { companyProfileInput, LEGAL_ID_FIELDS } from "../../../shared/schemas";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Modal } from "../../components/ui/Dialog";
import { EmptyState, InlineError, Skeleton } from "../../components/ui/Feedback";
import { Field, optionsOf, SelectField, TextareaField } from "../../components/ui/Field";
import { api, errorMessage } from "../../lib/api";
import { applyServerErrors, text } from "../../lib/forms";
import type { CompanyProfile } from "../../lib/types";

const KEY = ["company", "profiles"] as const;

export function CompanyTab() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<CompanyProfile | null | undefined>(undefined);
  const profiles = useQuery({ queryKey: KEY, queryFn: ({ signal }) => api<{ items: CompanyProfile[] }>("/company/profiles", { signal }) });
  const makeDefault = useMutation({
    mutationFn: (p: CompanyProfile) => api(`/company/profiles/${p.id}/default`, { body: {} }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEY });
      toast.success("Entité par défaut modifiée.");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const items = profiles.data?.items ?? [];
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[60ch] text-xs leading-relaxed text-ink-3">
          Les entités émettrices portent la raison sociale, les identifiants légaux, le taux de TVA et les mentions qui figureront sur les devis. Une entité par pays si vous facturez au Maroc et en France.
        </p>
        <Button icon={<Plus className="size-4" />} onClick={() => setEditing(null)}>
          Ajouter une entité
        </Button>
      </div>
      {profiles.isPending ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Building className="size-5" />}
            title="Aucune entité émettrice"
            text="Renseignez la société qui émettra les devis : raison sociale, identifiants légaux, taux de TVA, mentions."
            action={
              <Button size="sm" onClick={() => setEditing(null)}>
                Renseigner l’entité
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((p) => {
            const ids = LEGAL_ID_FIELDS[p.country].filter((f) => p.legalIds[f.key]);
            return (
              <Card key={p.id} className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-ink">{p.label}</p>
                      {p.isDefault ? <Badge tone="accent">Par défaut</Badge> : null}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-ink-2">{p.legalName}</p>
                  </div>
                  <Button variant="ghost" size="sm" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(p)}>
                    Modifier
                  </Button>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <dt className="text-ink-3">Pays</dt>
                  <dd className="text-right font-medium text-ink">{COUNTRY_LABELS[p.country]}</dd>
                  <dt className="text-ink-3">Devise</dt>
                  <dd className="text-right font-medium text-ink">{p.defaultCurrency}</dd>
                  <dt className="text-ink-3">TVA par défaut</dt>
                  <dd className="text-right font-medium text-ink tabular">{p.defaultVatRate ? `${Number(p.defaultVatRate).toLocaleString("fr-FR")} %` : "Non renseignée"}</dd>
                  {ids.map((f) => (
                    <div key={f.key} className="contents">
                      <dt className="text-ink-3">{f.label}</dt>
                      <dd className="truncate text-right font-medium text-ink tabular">{p.legalIds[f.key]}</dd>
                    </div>
                  ))}
                </dl>
                {!p.isDefault ? (
                  <div className="mt-auto pt-4">
                    <Button variant="secondary" size="sm" icon={<Star className="size-3.5" />} loading={makeDefault.isPending && makeDefault.variables?.id === p.id} onClick={() => makeDefault.mutate(p)}>
                      Définir par défaut
                    </Button>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
      <CompanyDialog open={editing !== undefined} onOpenChange={(open) => !open && setEditing(undefined)} profile={editing} />
    </div>
  );
}

type Values = z.input<typeof companyProfileInput>;
type Output = z.output<typeof companyProfileInput>;

function initial(p?: CompanyProfile | null): Values {
  return {
    label: text(p?.label),
    legalName: text(p?.legalName),
    tradeName: text(p?.tradeName),
    legalForm: text(p?.legalForm),
    country: p?.country ?? "MA",
    address: text(p?.address),
    city: text(p?.city),
    postalCode: text(p?.postalCode),
    email: text(p?.email),
    phone: text(p?.phone),
    website: text(p?.website),
    legalIds: { ...(p?.legalIds ?? {}) },
    defaultCurrency: p?.defaultCurrency ?? "MAD",
    defaultVatRate: text(p?.defaultVatRate),
    quoteLegalMentions: text(p?.quoteLegalMentions),
    paymentTerms: text(p?.paymentTerms),
  };
}

function CompanyDialog({ open, onOpenChange, profile }: { open: boolean; onOpenChange: (open: boolean) => void; profile: CompanyProfile | null | undefined }) {
  const queryClient = useQueryClient();
  const [general, setGeneral] = useState<string | null>(null);
  const form = useForm<Values, unknown, Output>({ resolver: zodResolver(companyProfileInput), defaultValues: initial(profile) });
  const { register, reset, setError, handleSubmit, control, formState } = form;
  const errors = formState.errors;
  const country = useWatch({ control, name: "country" });

  useEffect(() => {
    if (!open) return;
    reset(initial(profile));
    setGeneral(null);
  }, [open, profile, reset]);

  const save = useMutation({
    mutationFn: (data: Output) => {
      const keys: string[] = LEGAL_ID_FIELDS[data.country].map((f) => f.key);
      const body = { ...data, legalIds: Object.fromEntries(Object.entries(data.legalIds).filter(([k]) => keys.includes(k))) };
      return profile ? api(`/company/profiles/${profile.id}`, { method: "PATCH", body }) : api("/company/profiles", { body });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEY });
      toast.success(profile ? "Entité mise à jour." : "Entité ajoutée.");
      onOpenChange(false);
    },
    onError: (error) => setGeneral(applyServerErrors(error, setError)),
  });

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={profile ? "Modifier l’entité" : "Nouvelle entité émettrice"}
      description="Ces informations figureront sur les devis. Rien n’est supposé : chaque valeur est la vôtre."
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
            {profile ? "Enregistrer" : "Ajouter"}
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
        <Field label="Nom court" placeholder="Entité Maroc" {...register("label")} error={errors.label?.message} hint="Affiché dans l’application." />
        <Field label="Raison sociale" autoComplete="organization" {...register("legalName")} error={errors.legalName?.message} />
        <Field label="Nom commercial" optional {...register("tradeName")} error={errors.tradeName?.message} />
        <Field label="Forme juridique" optional placeholder="SARL, SAS…" {...register("legalForm")} error={errors.legalForm?.message} />
        <SelectField label="Pays" options={optionsOf(COUNTRY_LABELS)} {...register("country")} error={errors.country?.message} />
        <SelectField label="Devise par défaut" options={optionsOf(CURRENCY_LABELS)} {...register("defaultCurrency")} error={errors.defaultCurrency?.message} />
        <Field label="Adresse" optional className="sm:col-span-2" autoComplete="street-address" {...register("address")} error={errors.address?.message} />
        <Field label="Code postal" optional autoComplete="postal-code" {...register("postalCode")} error={errors.postalCode?.message} />
        <Field label="Ville" optional autoComplete="address-level2" {...register("city")} error={errors.city?.message} />
        <Field label="E-mail" optional type="email" {...register("email")} error={errors.email?.message} />
        <Field label="Téléphone" optional type="tel" {...register("phone")} error={errors.phone?.message} />
        <Field label="Site web" optional {...register("website")} error={errors.website?.message} />
        <Field label="Taux de TVA par défaut (%)" optional inputMode="decimal" {...register("defaultVatRate")} error={errors.defaultVatRate?.message} hint="Saisi par vous, jamais supposé." />
        <fieldset className="grid gap-4 rounded-xl border border-line p-4 sm:col-span-2 sm:grid-cols-2">
          <legend className="px-1 text-2xs font-semibold tracking-wide text-ink-3 uppercase">Identifiants légaux</legend>
          {(LEGAL_ID_FIELDS[country ?? "MA"] ?? []).map((f) => (
            <Field key={`${country}-${f.key}`} label={f.label} optional {...register(`legalIds.${f.key}`)} />
          ))}
        </fieldset>
        <TextareaField label="Mentions légales des devis" optional className="sm:col-span-2" rows={4} {...register("quoteLegalMentions")} error={errors.quoteLegalMentions?.message} />
        <TextareaField label="Conditions de paiement" optional className="sm:col-span-2" rows={3} {...register("paymentTerms")} error={errors.paymentTerms?.message} />
      </div>
    </Modal>
  );
}
