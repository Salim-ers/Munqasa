import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MARGIN_MODE_LABELS, RATE_BASE_LABELS } from "../../../shared/enums";
import { type PricingSettings, pricingSettings } from "../../../shared/settings";
import { Button } from "../../components/ui/Button";
import { Card, CardHeader } from "../../components/ui/Card";
import { InlineError, Skeleton } from "../../components/ui/Feedback";
import { Field, optionsOf, SelectField } from "../../components/ui/Field";
import { api, ApiError, errorMessage } from "../../lib/api";

const KEY = ["settings", "chiffrage"] as const;

const MARGIN_HINTS: Record<PricingSettings["marginMode"], string> = {
  taux_de_marge: "Prix de vente = prix de revient × (1 + taux).",
  taux_de_marque: "Prix de vente = prix de revient ÷ (1 − taux) : la marge est une part du prix de vente.",
  coefficient: "Prix de vente = prix de revient × coefficient, par exemple 1,15.",
};

/** Frais généraux, aléas et marge recopiés dans chaque nouveau sous-détail. */
export function PricingTab() {
  const queryClient = useQueryClient();
  const setting = useQuery({ queryKey: KEY, queryFn: ({ signal }) => api<{ value: PricingSettings }>("/settings/chiffrage", { signal }) });
  const [values, setValues] = useState<PricingSettings | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (setting.data) setValues(setting.data.value);
  }, [setting.data]);

  const save = useMutation({
    mutationFn: (value: PricingSettings) => api<{ value: PricingSettings }>("/settings/chiffrage", { method: "PUT", body: value }),
    onSuccess: ({ value }) => {
      queryClient.setQueryData(KEY, { value });
      toast.success("Réglages de chiffrage enregistrés pour les prochains sous-détails.");
    },
    onError: (e) => (e instanceof ApiError && Object.keys(e.fields).length ? setErrors(e.fields) : setError(errorMessage(e))),
  });

  if (!values) return <Skeleton className="h-72" />;

  const submit = () => {
    const parsed = pricingSettings.safeParse(values);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[issue.path.join(".")] ??= issue.message;
      return setErrors(next);
    }
    const v = parsed.data;
    if (v.marginMode === "taux_de_marque" && v.marginRate && Number(v.marginRate) >= 100) return setErrors({ marginRate: "Un taux de marque reste inférieur à 100 %." });
    if (v.marginMode === "coefficient" && v.marginRate && Number(v.marginRate) < 1) return setErrors({ marginRate: "Un coefficient inférieur à 1 vendrait à perte." });
    setErrors({});
    setError(null);
    save.mutate(v);
  };

  const set = <K extends keyof PricingSettings>(key: K, value: PricingSettings[K]) => setValues({ ...values, [key]: value });
  const dirty = JSON.stringify(values) !== JSON.stringify(setting.data?.value);
  const bases = optionsOf(RATE_BASE_LABELS);
  return (
    <Card className="max-w-3xl p-5">
      <CardHeader
        title="Frais et marge"
        subtitle="Recopiés dans chaque nouveau sous-détail, puis modifiables poste par poste. Un taux laissé vide n’est jamais supposé : sans aucun taux, le prix de vente est égal au déboursé."
      />
      <div className="mt-5 grid gap-5">
        {error ? <InlineError>{error}</InlineError> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Frais généraux (%)" optional inputMode="decimal" value={values.overheadRate} onChange={(e) => set("overheadRate", e.target.value)} error={errors.overheadRate} />
          <SelectField label="Calculés sur" options={bases} value={values.overheadBase} onChange={(e) => set("overheadBase", e.target.value as PricingSettings["overheadBase"])} />
          <Field label="Aléas (%)" optional inputMode="decimal" value={values.contingencyRate} onChange={(e) => set("contingencyRate", e.target.value)} error={errors.contingencyRate} />
          <SelectField label="Calculés sur" options={bases} value={values.contingencyBase} onChange={(e) => set("contingencyBase", e.target.value as PricingSettings["contingencyBase"])} />
          <SelectField label="Mode de marge" options={optionsOf(MARGIN_MODE_LABELS)} value={values.marginMode} onChange={(e) => set("marginMode", e.target.value as PricingSettings["marginMode"])} hint={MARGIN_HINTS[values.marginMode]} />
          <Field
            label={values.marginMode === "coefficient" ? "Coefficient" : values.marginMode === "taux_de_marque" ? "Taux de marque (%)" : "Taux de marge (%)"}
            optional
            inputMode="decimal"
            value={values.marginRate}
            onChange={(e) => set("marginRate", e.target.value)}
            error={errors.marginRate}
          />
        </div>
        <p className="rounded-xl bg-surface-2 p-3.5 text-2xs leading-relaxed text-ink-3">
          Déboursé sec : matériaux, main-d’œuvre, matériel, sous-traitance et transport. Déboursé total : déboursé sec et frais de chantier. Calculés sur le prix de revient, frais et aléas sont résolus exactement, sans approximation.
        </p>
      </div>
      <div className="mt-6 flex justify-end gap-2 border-t border-line pt-4">
        <Button variant="secondary" disabled={!dirty} onClick={() => setting.data && setValues(setting.data.value)}>
          Annuler les modifications
        </Button>
        <Button loading={save.isPending} disabled={!dirty} onClick={submit}>
          Enregistrer
        </Button>
      </div>
    </Card>
  );
}
