import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { type AlertSettings, alertSettings } from "../../../shared/settings";
import { Button } from "../../components/ui/Button";
import { Card, CardHeader } from "../../components/ui/Card";
import { InlineError, Skeleton } from "../../components/ui/Feedback";
import { Field } from "../../components/ui/Field";
import { api, errorMessage } from "../../lib/api";

const KEY = ["settings", "alertes"] as const;

const dayLabel = (d: number) => (d === 0 ? "Le jour même" : d === 1 ? "La veille" : `${d} jours avant`);

export function AlertsTab() {
  const queryClient = useQueryClient();
  const setting = useQuery({ queryKey: KEY, queryFn: ({ signal }) => api<{ value: AlertSettings }>("/settings/alertes", { signal }) });
  const [values, setValues] = useState<AlertSettings | null>(null);
  const [newDay, setNewDay] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (setting.data) setValues(setting.data.value);
  }, [setting.data]);

  const save = useMutation({
    mutationFn: (value: AlertSettings) => api<{ value: AlertSettings }>("/settings/alertes", { method: "PUT", body: value }),
    onSuccess: ({ value }) => {
      queryClient.setQueryData(KEY, { value });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Réglages d’alerte enregistrés.");
    },
    onError: (e) => setError(errorMessage(e)),
  });

  if (!values) return <Skeleton className="h-72" />;

  const days = [...values.deadlineReminderDays].sort((a, b) => b - a);
  const addDay = () => {
    const n = Number(newDay);
    if (!Number.isInteger(n) || n < 0 || n > 60) return setError("Indiquez un nombre de jours entre 0 et 60.");
    if (days.includes(n)) return setError("Ce rappel existe déjà.");
    if (days.length >= 6) return setError("Six rappels au plus.");
    setError(null);
    setValues({ ...values, deadlineReminderDays: [...days, n] });
    setNewDay("");
  };

  const submit = () => {
    const parsed = alertSettings.safeParse(values);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Valeurs invalides.");
    setError(null);
    save.mutate(parsed.data);
  };

  const dirty = JSON.stringify(values) !== JSON.stringify(setting.data?.value);
  return (
    <Card className="max-w-3xl p-5">
      <CardHeader title="Rappels et seuils" subtitle="Appliqués par la tâche planifiée quotidienne et par le tableau de bord." />
      <div className="mt-5 grid gap-6">
        {error ? <InlineError>{error}</InlineError> : null}
        <div>
          <p className="text-xs font-semibold text-ink-2">Rappels d’échéance</p>
          <p className="mt-1 text-2xs text-ink-3">Une notification est créée à chaque seuil, ainsi que le jour même, pour chaque date de remise et chaque échéance.</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {days.map((d) => (
              <li key={d} className="flex h-9 items-center gap-1.5 rounded-xl border border-line bg-surface-2 pr-1.5 pl-3 text-xs font-medium text-ink">
                {dayLabel(d)}
                <button
                  type="button"
                  onClick={() => setValues({ ...values, deadlineReminderDays: days.filter((x) => x !== d) })}
                  className="grid size-6 place-items-center rounded-lg text-ink-3 hover:bg-surface hover:text-danger"
                  aria-label={`Retirer le rappel ${dayLabel(d).toLowerCase()}`}
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex max-w-xs items-end gap-2">
            <Field
              label="Ajouter un rappel (jours avant)"
              type="number"
              min={0}
              max={60}
              inputMode="numeric"
              value={newDay}
              onChange={(e) => setNewDay(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addDay();
                }
              }}
              className="flex-1"
            />
            <Button variant="secondary" icon={<Plus className="size-4" />} onClick={addDay} disabled={!newDay}>
              Ajouter
            </Button>
          </div>
        </div>
        <Field
          label="Ancienneté d’un prix à revoir (mois)"
          type="number"
          min={1}
          max={120}
          inputMode="numeric"
          className="max-w-xs"
          value={String(values.stalePriceMonths)}
          onChange={(e) => setValues({ ...values, stalePriceMonths: Number(e.target.value) })}
          hint="Au-delà, un prix de la bibliothèque est signalé comme ancien."
        />
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
