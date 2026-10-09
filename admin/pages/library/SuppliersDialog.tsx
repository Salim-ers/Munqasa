import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { COUNTRY_LABELS } from "../../../shared/enums";
import { supplierInput } from "../../../shared/schemas";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Dialog";
import { EmptyState, InlineError, Skeleton } from "../../components/ui/Feedback";
import { Field, optionsOf, SelectField } from "../../components/ui/Field";
import { api, ApiError, errorMessage } from "../../lib/api";
import type { Supplier } from "../../lib/types";

const KEY = ["library", "suppliers"] as const;
const blank = { name: "", country: "MA", city: "", contactName: "", email: "", phone: "", notes: "" };

/** Fournisseurs : rattachés aux prix pour en garder la provenance. */
export function SuppliersDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const suppliers = useQuery({ queryKey: KEY, queryFn: ({ signal }) => api<{ items: Supplier[] }>("/library/suppliers", { signal }), enabled: open });
  const [editing, setEditing] = useState<Supplier | null | undefined>(undefined);
  const [values, setValues] = useState(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);

  const start = (supplier: Supplier | null) => {
    setEditing(supplier);
    setValues(
      supplier
        ? { name: supplier.name, country: supplier.country, city: supplier.city ?? "", contactName: supplier.contactName ?? "", email: supplier.email ?? "", phone: supplier.phone ?? "", notes: supplier.notes ?? "" }
        : blank,
    );
    setErrors({});
    setGeneral(null);
  };

  const save = useMutation({
    mutationFn: (data: unknown) => (editing ? api(`/library/suppliers/${editing.id}`, { method: "PATCH", body: data }) : api("/library/suppliers", { body: data })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["library"] });
      toast.success(editing ? "Fournisseur modifié." : "Fournisseur ajouté.");
      setEditing(undefined);
    },
    onError: (e) => (e instanceof ApiError && Object.keys(e.fields).length ? setErrors(e.fields) : setGeneral(errorMessage(e))),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = supplierInput.safeParse(values);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[issue.path.join(".")] ??= issue.message;
      return setErrors(next);
    }
    save.mutate(parsed.data);
  }

  const set = (key: keyof typeof values, value: string) => setValues((v) => ({ ...v, [key]: value }));
  const items = suppliers.data?.items ?? [];
  const formOpen = editing !== undefined;
  return (
    <Modal
      open={open}
      onOpenChange={(v) => {
        if (!v) setEditing(undefined);
        onOpenChange(v);
      }}
      title="Fournisseurs"
      description="Rattachez vos prix à leur fournisseur pour retrouver d’où vient chaque coût."
      size="lg"
      onSubmit={formOpen ? submit : undefined}
      footer={
        formOpen ? (
          <>
            <Button variant="secondary" onClick={() => setEditing(undefined)}>
              Annuler
            </Button>
            <Button type="submit" loading={save.isPending}>
              {editing ? "Enregistrer" : "Ajouter"}
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Fermer
            </Button>
            <Button icon={<Plus className="size-4" />} onClick={() => start(null)}>
              Ajouter un fournisseur
            </Button>
          </>
        )
      }
    >
      {formOpen ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {general ? (
            <div className="sm:col-span-2">
              <InlineError>{general}</InlineError>
            </div>
          ) : null}
          <Field label="Nom" className="sm:col-span-2" value={values.name} onChange={(e) => set("name", e.target.value)} error={errors.name} />
          <SelectField label="Pays" options={optionsOf(COUNTRY_LABELS)} value={values.country} onChange={(e) => set("country", e.target.value)} />
          <Field label="Ville" optional value={values.city} onChange={(e) => set("city", e.target.value)} />
          <Field label="Contact" optional value={values.contactName} onChange={(e) => set("contactName", e.target.value)} />
          <Field label="Téléphone" optional type="tel" value={values.phone} onChange={(e) => set("phone", e.target.value)} />
          <Field label="E-mail" optional type="email" className="sm:col-span-2" value={values.email} onChange={(e) => set("email", e.target.value)} error={errors.email} />
        </div>
      ) : suppliers.isPending ? (
        <Skeleton className="h-24" />
      ) : items.length === 0 ? (
        <EmptyState title="Aucun fournisseur" text="Ajoutez vos fournisseurs habituels : négoces, centrales à béton, loueurs, sous-traitants." />
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {items.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-ink">{s.name}</p>
                <p className="truncate text-2xs text-ink-3">{[s.city, COUNTRY_LABELS[s.country], s.contactName, s.phone, s.email].filter(Boolean).join(", ")}</p>
              </div>
              <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => start(s)} aria-label={`Modifier ${s.name}`} />
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
