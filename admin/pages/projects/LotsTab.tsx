import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Layers, Pencil, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { projectLotInput } from "../../../shared/schemas";
import { TRADE_FAMILIES, tradeLabel } from "../../../shared/trades";
import { Button } from "../../components/ui/Button";
import { Card, CardHeader } from "../../components/ui/Card";
import { ConfirmDialog, Modal } from "../../components/ui/Dialog";
import { EmptyState, InlineError } from "../../components/ui/Feedback";
import { Field, SelectField } from "../../components/ui/Field";
import { ActionMenu } from "../../components/ui/Menu";
import { api, ApiError, errorMessage } from "../../lib/api";
import type { Lot } from "../../lib/types";

const familyOptions = TRADE_FAMILIES.map((f) => ({ value: f.key, label: f.label }));

/** Code suivant libre (01, 02…), proposé à la création. */
function nextCode(lots: Lot[]): string {
  const used = new Set(lots.map((l) => l.code));
  for (let i = 1; i < 100; i++) {
    const code = String(i).padStart(2, "0");
    if (!used.has(code)) return code;
  }
  return "";
}

export function LotsTab({ projectId, lots }: { projectId: string; lots: Lot[] }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Lot | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<Lot | null>(null);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    void queryClient.invalidateQueries({ queryKey: ["projects"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  return (
    <Card className="overflow-hidden">
      <div className="p-5 pb-4">
        <CardHeader
          title="Lots"
          subtitle="Chaque lot relève d’une famille de corps d’état : les documents ne mélangent jamais les lots."
          action={
            <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setEditing(null)}>
              Ajouter un lot
            </Button>
          }
        />
      </div>
      {lots.length === 0 ? (
        <EmptyState
          icon={<Layers className="size-5" />}
          title="Aucun lot"
          text="Découpez l’affaire en lots (gros œuvre, menuiseries, lots techniques…) pour préparer CCTP et DPGF."
          action={
            <Button size="sm" onClick={() => setEditing(null)}>
              Ajouter le premier lot
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {lots.map((lot) => (
            <li key={lot.id} className="flex items-center gap-4 px-5 py-3">
              <span className="grid h-9 min-w-11 place-items-center rounded-lg bg-surface-2 px-2 text-xs font-semibold text-ink tabular">{lot.code}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-ink">{lot.name}</p>
                <p className="truncate text-2xs text-ink-3">{tradeLabel(lot.tradeFamily)}</p>
              </div>
              <ActionMenu
                actions={[
                  { label: "Modifier", icon: <Pencil />, onSelect: () => setEditing(lot) },
                  { label: "Supprimer", icon: <Trash2 />, tone: "danger", onSelect: () => setDeleting(lot) },
                ]}
              />
            </li>
          ))}
        </ul>
      )}

      <LotDialog projectId={projectId} lot={editing} open={editing !== undefined} onOpenChange={(open) => !open && setEditing(undefined)} suggestedCode={nextCode(lots)} onSaved={refresh} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Supprimer ce lot ?"
        text={deleting ? `Le lot ${deleting.code}, ${deleting.name}, sera retiré de l’affaire. Un lot qui contient déjà des ouvrages ne peut pas être supprimé.` : ""}
        confirmLabel="Supprimer"
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await api(`/projects/${projectId}/lots/${deleting.id}`, { method: "DELETE" });
            toast.success("Lot supprimé.");
            refresh();
          } catch (error) {
            toast.error(errorMessage(error));
            throw error;
          }
        }}
      />
    </Card>
  );
}

function LotDialog({
  projectId,
  lot,
  open,
  onOpenChange,
  suggestedCode,
  onSaved,
}: {
  projectId: string;
  lot: Lot | null | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suggestedCode: string;
  onSaved: () => void;
}) {
  const [values, setValues] = useState({ code: "", name: "", tradeFamily: "gros_oeuvre" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setValues(lot ? { code: lot.code, name: lot.name, tradeFamily: lot.tradeFamily } : { code: suggestedCode, name: "", tradeFamily: "gros_oeuvre" });
    setErrors({});
    setGeneral(null);
    // Le code proposé n'est lu qu'à l'ouverture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lot]);

  const save = useMutation({
    mutationFn: (data: typeof values) =>
      lot ? api(`/projects/${projectId}/lots/${lot.id}`, { method: "PATCH", body: data }) : api(`/projects/${projectId}/lots`, { body: data }),
    onSuccess: () => {
      toast.success(lot ? "Lot mis à jour." : "Lot ajouté.");
      onOpenChange(false);
      onSaved();
    },
    onError: (error) => {
      if (error instanceof ApiError && Object.keys(error.fields).length) setErrors(error.fields);
      else setGeneral(errorMessage(error));
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setGeneral(null);
    const parsed = projectLotInput.safeParse(values);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[issue.path.join(".")] ??= issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    save.mutate(parsed.data);
  }

  const family = TRADE_FAMILIES.find((f) => f.key === values.tradeFamily);
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={lot ? "Modifier le lot" : "Nouveau lot"}
      size="sm"
      onSubmit={submit}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="submit" loading={save.isPending}>
            {lot ? "Enregistrer" : "Ajouter"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {general ? <InlineError>{general}</InlineError> : null}
        <div className="grid grid-cols-[6rem_1fr] gap-3">
          <Field label="Code" value={values.code} onChange={(e) => setValues((v) => ({ ...v, code: e.target.value }))} error={errors.code} maxLength={20} />
          <Field label="Intitulé" value={values.name} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} error={errors.name} placeholder="Gros œuvre" />
        </div>
        <SelectField
          label="Famille de corps d’état"
          options={familyOptions}
          value={values.tradeFamily}
          onChange={(e) => setValues((v) => ({ ...v, tradeFamily: e.target.value }))}
          error={errors.tradeFamily}
          hint={family ? family.subFamilies.slice(0, 5).join(", ") + (family.subFamilies.length > 5 ? "…" : "") : undefined}
        />
      </div>
    </Modal>
  );
}
