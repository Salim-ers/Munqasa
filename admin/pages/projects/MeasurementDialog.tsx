import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { MEASURE_METHOD_LABELS, type MeasureMethod } from "../../../shared/enums";
import { evaluateFormula, formulaVariables } from "../../../shared/formula";
import { measurementInput } from "../../../shared/schemas";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Dialog";
import { InlineError } from "../../components/ui/Feedback";
import { Field, optionsOf, SelectField, TextareaField } from "../../components/ui/Field";
import { api, ApiError, errorMessage } from "../../lib/api";
import { formatNumber } from "../../lib/format";
import type { Drawing, Measurement, WorkItem } from "../../lib/types";

interface Values {
  label: string;
  method: MeasureMethod;
  formula: string;
  inputs: Array<{ name: string; value: string }>;
  unit: string;
  drawingId: string;
  zoneRef: string;
  notes: string;
}

function initial(measurement: Measurement | null | undefined, item: WorkItem | null): Values {
  return {
    label: measurement?.label ?? "",
    method: measurement?.method ?? "volume",
    formula: measurement?.formula ?? "",
    inputs: measurement ? Object.entries(measurement.inputs).map(([name, value]) => ({ name, value })) : [],
    unit: measurement?.unit ?? item?.unit ?? "",
    drawingId: measurement?.drawingId ?? "",
    zoneRef: measurement?.zoneRef ?? "",
    notes: measurement?.notes ?? "",
  };
}

/** Mesure : formule et entrées nommées, quantité recalculée en direct (et toujours par le serveur). */
export function MeasurementDialog({
  open,
  onOpenChange,
  projectId,
  item,
  measurement,
  drawings,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  item: WorkItem | null;
  measurement?: Measurement | null;
  drawings: Drawing[];
}) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Values>(() => initial(measurement, item));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setValues(initial(measurement, item));
    setErrors({});
    setGeneral(null);
  }, [open, measurement, item]);

  // Chaque variable de la formule a sa ligne d'entrée.
  const variables = useMemo(() => {
    try {
      return formulaVariables(values.formula);
    } catch {
      return [];
    }
  }, [values.formula]);
  useEffect(() => {
    setValues((v) => {
      const missing = variables.filter((name) => !v.inputs.some((i) => i.name === name));
      return missing.length ? { ...v, inputs: [...v.inputs, ...missing.map((name) => ({ name, value: "" }))] } : v;
    });
  }, [variables]);

  const preview = useMemo(() => {
    if (!values.formula.trim()) return { value: null, error: null };
    try {
      return { value: evaluateFormula(values.formula, Object.fromEntries(values.inputs.filter((i) => i.name && i.value).map((i) => [i.name, i.value]))), error: null };
    } catch (e) {
      return { value: null, error: (e as Error).message };
    }
  }, [values.formula, values.inputs]);

  const save = useMutation({
    mutationFn: (data: unknown) => (measurement ? api(`/measurements/${measurement.id}`, { method: "PATCH", body: data }) : api(`/work-items/${item!.id}/measurements`, { body: data })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["project", projectId, "metre"] });
      toast.success(measurement ? "Mesure mise à jour, à vérifier." : "Mesure ajoutée.");
      onOpenChange(false);
    },
    onError: (error) => {
      if (error instanceof ApiError && Object.keys(error.fields).length) setErrors(error.fields);
      else setGeneral(errorMessage(error));
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setGeneral(null);
    const data = { ...values, inputs: values.inputs.filter((i) => i.name.trim()), drawingId: values.drawingId || null };
    const parsed = measurementInput.safeParse(data);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[issue.path.join(".")] ??= issue.message;
      setErrors(next);
      if (Object.keys(next).some((k) => k.startsWith("inputs"))) setGeneral("Chaque entrée doit avoir un nom valide et une valeur.");
      return;
    }
    if (preview.error) return setErrors({ formula: preview.error });
    setErrors({});
    save.mutate(parsed.data);
  }

  const set = <K extends keyof Values>(key: K, value: Values[K]) => setValues((v) => ({ ...v, [key]: value }));
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={measurement ? "Modifier la mesure" : "Nouvelle mesure"}
      description={item ? [item.code, item.designation].filter(Boolean).join(", ") : undefined}
      size="lg"
      onSubmit={submit}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="submit" loading={save.isPending}>
            {measurement ? "Enregistrer" : "Ajouter"}
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
        <Field label="Libellé" className="sm:col-span-2" value={values.label} onChange={(e) => set("label", e.target.value)} error={errors.label} placeholder="Semelle filante SF1" />
        <SelectField label="Méthode" options={optionsOf(MEASURE_METHOD_LABELS)} value={values.method} onChange={(e) => set("method", e.target.value as MeasureMethod)} />
        <Field label="Unité" value={values.unit} onChange={(e) => set("unit", e.target.value)} error={errors.unit} placeholder="m3" />
        <Field
          label="Formule"
          className="sm:col-span-2"
          value={values.formula}
          onChange={(e) => set("formula", e.target.value)}
          error={errors.formula}
          placeholder="L * l * h * n"
          spellCheck={false}
          hint="Variables nommées, opérateurs + - * / et parenthèses. Les valeurs sont en mètres."
        />
        <fieldset className="grid gap-2 sm:col-span-2">
          <legend className="mb-1 text-xs font-semibold text-ink-2">Entrées</legend>
          {values.inputs.map((input, index) => (
            <div key={index} className="grid grid-cols-[6rem_1fr_auto] gap-2">
              <input
                aria-label="Nom de la variable"
                value={input.name}
                onChange={(e) => set("inputs", values.inputs.map((x, i) => (i === index ? { ...x, name: e.target.value } : x)))}
                className="h-10 rounded-xl border border-line-strong bg-surface px-3 font-mono text-xs text-ink outline-none focus:border-accent"
              />
              <input
                aria-label={`Valeur de ${input.name || "la variable"}`}
                value={input.value}
                inputMode="decimal"
                onChange={(e) => set("inputs", values.inputs.map((x, i) => (i === index ? { ...x, value: e.target.value } : x)))}
                className="h-10 rounded-xl border border-line-strong bg-surface px-3 text-xs text-ink outline-none focus:border-accent tabular"
              />
              <button
                type="button"
                onClick={() => set("inputs", values.inputs.filter((_, i) => i !== index))}
                className="grid size-10 place-items-center rounded-xl text-ink-3 hover:bg-surface-2 hover:text-danger"
                aria-label={`Retirer ${input.name || "cette entrée"}`}
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => set("inputs", [...values.inputs, { name: "", value: "" }])}>
              Ajouter une entrée
            </Button>
            <p className={preview.error ? "text-2xs text-danger" : "text-xs font-semibold text-ink tabular"} aria-live="polite">
              {preview.error ? preview.error : preview.value ? `Quantité : ${formatNumber(preview.value)} ${values.unit}` : ""}
            </p>
          </div>
        </fieldset>
        <SelectField
          label="Planche d’origine"
          optional
          placeholder="Aucune"
          options={drawings.map((d) => ({ value: d.id, label: [d.title ?? d.fileName, `p. ${d.pageNumber}`].join(", ") }))}
          value={values.drawingId}
          onChange={(e) => set("drawingId", e.target.value)}
        />
        <Field label="Zone" optional value={values.zoneRef} onChange={(e) => set("zoneRef", e.target.value)} placeholder="Axe A, files 1 à 4" />
        <TextareaField label="Notes et sources" optional className="sm:col-span-2" rows={3} value={values.notes} onChange={(e) => set("notes", e.target.value)} />
      </div>
    </Modal>
  );
}
