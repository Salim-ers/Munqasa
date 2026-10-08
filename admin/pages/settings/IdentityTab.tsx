import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { type DocumentIdentity, documentIdentity } from "../../../shared/settings";
import { Button } from "../../components/ui/Button";
import { Card, CardHeader } from "../../components/ui/Card";
import { InlineError, Skeleton } from "../../components/ui/Feedback";
import { Checkbox, Field, SelectField } from "../../components/ui/Field";
import { Segmented } from "../../components/ui/Segmented";
import { api, ApiError, errorMessage } from "../../lib/api";

const KEY = ["settings", "identite_documentaire"] as const;

function ColorField({ label, value, onChange, error }: { label: string; value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <div className="grid content-start gap-1.5">
      <span className="text-xs font-semibold text-ink-2">{label}</span>
      <div className="flex items-center gap-2">
        <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"} onChange={(e) => onChange(e.target.value.toUpperCase())} className="size-11 shrink-0 cursor-pointer rounded-field border border-line-strong bg-surface p-1" aria-label={`${label}, sélecteur`} />
        <Field label={label} className="flex-1 [&>label]:sr-only" value={value} onChange={(e) => onChange(e.target.value)} error={error} maxLength={7} spellCheck={false} />
      </div>
    </div>
  );
}

export function IdentityTab() {
  const queryClient = useQueryClient();
  const setting = useQuery({ queryKey: KEY, queryFn: ({ signal }) => api<{ value: DocumentIdentity }>("/settings/identite_documentaire", { signal }) });
  const [values, setValues] = useState<DocumentIdentity | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);

  useEffect(() => {
    if (setting.data) setValues(setting.data.value);
  }, [setting.data]);

  const save = useMutation({
    mutationFn: (value: DocumentIdentity) => api<{ value: DocumentIdentity }>("/settings/identite_documentaire", { method: "PUT", body: value }),
    onSuccess: ({ value }) => {
      queryClient.setQueryData(KEY, { value });
      toast.success("Identité documentaire enregistrée.");
    },
    onError: (error) => {
      if (error instanceof ApiError && Object.keys(error.fields).length) setErrors(error.fields);
      else setGeneral(errorMessage(error));
    },
  });

  if (!values) return <Skeleton className="h-96" />;
  const set = <K extends keyof DocumentIdentity>(key: K, value: DocumentIdentity[K]) => setValues((v) => (v ? { ...v, [key]: value } : v));

  const submit = () => {
    setGeneral(null);
    const parsed = documentIdentity.safeParse(values);
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
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <Card className="p-5">
        <CardHeader title="Présentation des documents" subtitle="Couleurs, typographies et couverture des CCTP, DPGF et devis exportés." />
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {general ? (
            <div className="sm:col-span-3">
              <InlineError>{general}</InlineError>
            </div>
          ) : null}
          <ColorField label="Couleur principale" value={values.primaryColor} onChange={(v) => set("primaryColor", v)} error={errors.primaryColor} />
          <ColorField label="Couleur secondaire" value={values.secondaryColor} onChange={(v) => set("secondaryColor", v)} error={errors.secondaryColor} />
          <ColorField label="Couleur du texte" value={values.inkColor} onChange={(v) => set("inkColor", v)} error={errors.inkColor} />
          <SelectField
            label="Typographie des titres"
            options={[
              { value: "Instrument Serif", label: "Instrument Serif" },
              { value: "Manrope", label: "Manrope" },
            ]}
            value={values.headingFont}
            onChange={(e) => set("headingFont", e.target.value as DocumentIdentity["headingFont"])}
          />
          <SelectField label="Typographie du texte" options={[{ value: "Manrope", label: "Manrope" }]} value={values.bodyFont} onChange={(e) => set("bodyFont", e.target.value as DocumentIdentity["bodyFont"])} />
          <div className="grid content-start gap-1.5">
            <span className="text-xs font-semibold text-ink-2">Couverture</span>
            <Segmented
              value={values.coverStyle}
              onChange={(v) => set("coverStyle", v)}
              options={[
                { value: "arche", label: "Arche" },
                { value: "sobre", label: "Sobre" },
              ]}
              label="Style de couverture"
            />
          </div>
          <Field label="Texte de pied de page" className="sm:col-span-2" value={values.footerText} onChange={(e) => set("footerText", e.target.value)} error={errors.footerText} maxLength={200} />
          <div className="flex items-end pb-3">
            <Checkbox label="Logo sur chaque page" checked={values.showLogoOnPages} onChange={(v) => set("showLogoOnPages", v)} />
          </div>
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

      <Card className="p-5">
        <CardHeader title="Aperçu" subtitle="Couverture d’un document" />
        <CoverPreview identity={values} />
      </Card>
    </div>
  );
}

/** Aperçu indicatif de la couverture (proportions A4). */
function CoverPreview({ identity }: { identity: DocumentIdentity }) {
  const heading = identity.headingFont === "Instrument Serif" ? "var(--font-serif)" : "var(--font-sans)";
  return (
    <div className="mx-auto mt-4 aspect-[210/297] w-full max-w-[15rem] overflow-hidden rounded-lg border border-line bg-white shadow-card" aria-hidden="true">
      <div className="relative flex h-full flex-col p-[9%]" style={{ color: identity.inkColor, fontFamily: "var(--font-sans)" }}>
        {identity.coverStyle === "arche" ? (
          <svg viewBox="0 0 100 120" className="absolute right-[-12%] bottom-[-6%] w-[78%] opacity-90">
            <path d="M8 120 V58 Q8 28 34 16 Q50 9 50 0 Q50 9 66 16 Q92 28 92 58 V120 Z" fill={identity.primaryColor} />
            <path d="M24 120 V66 Q24 46 40 37 Q50 32 50 24 Q50 32 60 37 Q76 46 76 66 V120" fill="none" stroke={identity.secondaryColor} strokeWidth="1.6" />
          </svg>
        ) : (
          <div className="absolute inset-x-0 top-0 h-[3%]" style={{ background: identity.primaryColor }} />
        )}
        <p className="relative text-[0.45rem] font-semibold tracking-[0.2em] uppercase" style={{ color: identity.primaryColor }}>
          Cahier des clauses techniques particulières
        </p>
        <p className="relative mt-[8%] text-[1.15rem] leading-[1.05]" style={{ fontFamily: heading }}>
          Intitulé de l’affaire
        </p>
        <p className="relative mt-[4%] text-[0.5rem] opacity-70">Lot, indice, date</p>
        <div className="relative mt-auto flex items-end justify-between gap-2 border-t pt-[4%] text-[0.42rem] opacity-80" style={{ borderColor: identity.secondaryColor }}>
          <span className="truncate">{identity.footerText}</span>
          <span>1 / 40</span>
        </div>
      </div>
    </div>
  );
}
