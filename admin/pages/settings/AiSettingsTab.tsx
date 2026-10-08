import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, CircleX, KeyRound, PlugZap } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { type AiSettings, aiSettings } from "../../../shared/settings";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card, CardHeader } from "../../components/ui/Card";
import { InlineError, Skeleton } from "../../components/ui/Feedback";
import { Checkbox, Field, SelectField } from "../../components/ui/Field";
import { api, ApiError, errorMessage } from "../../lib/api";
import { formatNumber } from "../../lib/format";

const KEY = ["settings", "ia"] as const;

export function AiSettingsTab() {
  const queryClient = useQueryClient();
  const setting = useQuery({ queryKey: KEY, queryFn: ({ signal }) => api<{ value: AiSettings }>("/settings/ia", { signal }) });
  const models = useQuery({
    queryKey: ["ai", "models"],
    queryFn: ({ signal }) => api<{ configured: boolean; models: string[]; error?: string }>("/ai/models", { signal }),
    staleTime: 10 * 60_000,
    retry: false,
  });
  const spend = useQuery({ queryKey: ["ai", "spend"], queryFn: ({ signal }) => api<{ monthUsd: string; budgetUsd: string | null }>("/ai/spend", { signal }) });
  const [values, setValues] = useState<AiSettings | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);

  useEffect(() => {
    if (setting.data) setValues(setting.data.value);
  }, [setting.data]);

  const save = useMutation({
    mutationFn: (value: AiSettings) => api<{ value: AiSettings }>("/settings/ia", { method: "PUT", body: value }),
    onSuccess: ({ value }) => {
      queryClient.setQueryData(KEY, { value });
      void queryClient.invalidateQueries({ queryKey: ["ai", "spend"] });
      toast.success("Paramètres IA enregistrés.");
    },
    onError: (error) => {
      if (error instanceof ApiError && Object.keys(error.fields).length) setErrors(error.fields);
      else setGeneral(errorMessage(error));
    },
  });

  const test = useMutation({
    mutationFn: () => api<{ ok: boolean; model: string; latencyMs: number; output: string }>("/ai/test", { body: {} }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["ai", "spend"] }),
  });

  if (!values) return <Skeleton className="h-96" />;
  const set = <K extends keyof AiSettings>(key: K, value: AiSettings[K]) => setValues((v) => (v ? { ...v, [key]: value } : v));
  const setPrice = (model: string, field: "input" | "cachedInput" | "output", value: string) =>
    setValues((v) => (v ? { ...v, pricing: { ...v.pricing, [model]: { ...(v.pricing[model] ?? { input: "", cachedInput: "", output: "" }), [field]: value } } } : v));

  const configured = models.data?.configured ?? false;
  const available = models.data?.models ?? [];
  // Un modèle déjà enregistré reste visible même s'il n'est plus proposé par l'API.
  const optionsFor = (current: string) => [...new Set([...(current ? [current] : []), ...available])].map((m) => ({ value: m, label: m }));
  const pricedModels = [...new Set([values.generationModel, values.extractionModel].filter(Boolean))];

  const submit = () => {
    setGeneral(null);
    const parsed = aiSettings.safeParse(values);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[issue.path.join(".")] ??= issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    save.mutate(parsed.data);
  };

  const dirty = JSON.stringify(values) !== JSON.stringify(setting.data?.value);
  const month = spend.data ? Number(spend.data.monthUsd) : null;
  const budget = spend.data?.budgetUsd ? Number(spend.data.budgetUsd) : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <Card className="p-5">
        <CardHeader title="Modèles et dépenses" subtitle="Les modèles proposés sont ceux que l’API OpenAI déclare disponibles pour votre compte." />
        {!models.isPending && !configured ? (
          <div className="mt-4 flex gap-3 rounded-xl border border-warning/25 bg-warning-soft p-4 text-xs leading-relaxed text-ink-2">
            <KeyRound className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
            <p>
              La clé OpenAI n’est pas configurée. Ajoutez la variable <code className="rounded bg-surface px-1 py-0.5 text-2xs">OPENAI_API_KEY</code> dans les variables d’environnement du projet Vercel (jamais dans le code ni dans le navigateur), puis redéployez.
            </p>
          </div>
        ) : null}
        {models.data?.error ? (
          <div className="mt-4">
            <InlineError>{models.data.error}</InlineError>
          </div>
        ) : null}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {general ? (
            <div className="sm:col-span-2">
              <InlineError>{general}</InlineError>
            </div>
          ) : null}
          <SelectField
            label="Modèle de rédaction"
            hint="CCTP, synthèses, assistant."
            placeholder={models.isPending ? "Chargement…" : configured ? "Choisir un modèle" : "Clé OpenAI requise"}
            options={optionsFor(values.generationModel)}
            value={values.generationModel}
            onChange={(e) => set("generationModel", e.target.value)}
            disabled={!configured && !values.generationModel}
          />
          <SelectField
            label="Modèle d’extraction"
            hint="Lecture des plans et documents, sorties structurées."
            placeholder={models.isPending ? "Chargement…" : configured ? "Choisir un modèle" : "Clé OpenAI requise"}
            options={optionsFor(values.extractionModel)}
            value={values.extractionModel}
            onChange={(e) => set("extractionModel", e.target.value)}
            disabled={!configured && !values.extractionModel}
          />
          <Field
            label="Plafond mensuel (dollars US)"
            optional
            inputMode="decimal"
            value={values.monthlyBudgetUsd}
            onChange={(e) => set("monthlyBudgetUsd", e.target.value)}
            error={errors.monthlyBudgetUsd}
            hint="Au-delà, les nouvelles générations sont refusées. Vide : aucun plafond."
          />
          <div className="flex items-end pb-3">
            <Checkbox label="Autoriser OpenAI à conserver les réponses" checked={values.storeResponses} onChange={(v) => set("storeResponses", v)} />
          </div>
        </div>

        <div className="mt-6 border-t border-line pt-5">
          <p className="text-xs font-semibold text-ink">Barème des modèles choisis</p>
          <p className="mt-1 text-2xs leading-relaxed text-ink-3">
            Recopiez le prix officiel affiché par OpenAI, en dollars pour un million de jetons. Sans barème, la consommation est comptée mais son coût n’est pas estimé : aucun prix n’est supposé.
          </p>
          {pricedModels.length === 0 ? (
            <p className="mt-3 text-xs text-ink-3">Choisissez d’abord un modèle.</p>
          ) : (
            <div className="mt-4 grid gap-4">
              {pricedModels.map((model) => (
                <fieldset key={model} className="grid gap-3 rounded-xl border border-line p-4 sm:grid-cols-3">
                  <legend className="px-1 text-2xs font-semibold text-ink-2">{model}</legend>
                  <Field label="Entrée" inputMode="decimal" value={values.pricing[model]?.input ?? ""} onChange={(e) => setPrice(model, "input", e.target.value)} error={errors[`pricing.${model}.input`]} />
                  <Field label="Entrée en cache" optional inputMode="decimal" value={values.pricing[model]?.cachedInput ?? ""} onChange={(e) => setPrice(model, "cachedInput", e.target.value)} error={errors[`pricing.${model}.cachedInput`]} />
                  <Field label="Sortie" inputMode="decimal" value={values.pricing[model]?.output ?? ""} onChange={(e) => setPrice(model, "output", e.target.value)} error={errors[`pricing.${model}.output`]} />
                </fieldset>
              ))}
            </div>
          )}
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

      <div className="grid content-start gap-4">
        <Card className="p-5">
          <CardHeader title="Dépense estimée" subtitle="Mois civil en cours" />
          {spend.isPending ? (
            <Skeleton className="mt-4 h-12" />
          ) : (
            <>
              <p className="mt-4 text-2xl font-semibold tracking-tight text-ink tabular">{month !== null ? `${formatNumber(month)} $` : ""}</p>
              <p className="mt-1 text-2xs text-ink-3">{budget ? `Plafond : ${formatNumber(budget)} $` : "Aucun plafond défini"}</p>
              {budget ? (
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={Math.round(((month ?? 0) / budget) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Part du plafond consommée">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, ((month ?? 0) / budget) * 100)}%` }} />
                </div>
              ) : null}
            </>
          )}
        </Card>
        <Card className="p-5">
          <CardHeader title="Essai de connexion" subtitle="Un court appel au modèle de rédaction enregistré." />
          <Button className="mt-4 w-full" variant="secondary" icon={<PlugZap className="size-4" />} loading={test.isPending} disabled={!configured || !setting.data?.value.generationModel} onClick={() => test.mutate()}>
            Tester l’API OpenAI
          </Button>
          {test.data ? (
            <div className="mt-3 flex items-start gap-2 text-xs text-ink-2">
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
              <p>
                Réponse de <strong className="font-semibold text-ink">{test.data.model}</strong> en {formatNumber(test.data.latencyMs)} ms.
              </p>
            </div>
          ) : test.error ? (
            <div className="mt-3 flex items-start gap-2 text-xs text-danger">
              <CircleX className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p>{errorMessage(test.error)}</p>
            </div>
          ) : null}
          {configured ? <Badge tone="success" className="mt-3">Clé configurée sur le serveur</Badge> : null}
        </Card>
      </div>
    </div>
  );
}
