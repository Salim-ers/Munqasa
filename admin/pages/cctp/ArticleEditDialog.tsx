import { useMutation } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Dialog";
import { InlineError } from "../../components/ui/Feedback";
import { Field } from "../../components/ui/Field";
import { api, errorMessage } from "../../lib/api";
import { cn } from "../../lib/cn";
import type { CctpBlock, CctpSection, TechnicalReference } from "../../lib/types";

const TYPES: Array<{ value: CctpBlock["type"]; label: string }> = [
  { value: "paragraphe", label: "Paragraphe" },
  { value: "exigence", label: "Exigence" },
  { value: "liste", label: "Liste" },
  { value: "note", label: "Note" },
];

interface EditableBlock {
  type: CctpBlock["type"];
  /** Texte, ou éléments de liste séparés par des retours à la ligne. */
  value: string;
  referenceIds: string[];
}

const toEditable = (b: CctpBlock): EditableBlock => ({ type: b.type, value: b.type === "liste" ? b.items.join("\n") : (b.text ?? ""), referenceIds: b.referenceIds });
const toBlock = (b: EditableBlock): CctpBlock =>
  b.type === "liste"
    ? { type: "liste", text: null, items: b.value.split("\n").map((s) => s.trim()).filter(Boolean), referenceIds: b.referenceIds }
    : { type: b.type, text: b.value.trim() || null, items: [], referenceIds: b.referenceIds };

/** Édition d'un article par blocs ; seules les références retenues pour le document sont proposées. */
export function ArticleEditDialog({ section, references, onOpenChange, onSaved }: { section: CctpSection | null; references: TechnicalReference[]; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
  const [title, setTitle] = useState("");
  const [blocks, setBlocks] = useState<EditableBlock[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!section) return;
    setTitle(section.title);
    setBlocks(section.content.length ? section.content.map(toEditable) : [{ type: "paragraphe", value: "", referenceIds: [] }]);
    setError(null);
  }, [section]);

  const save = useMutation({
    mutationFn: () => api(`/cctp/sections/${section!.id}`, { method: "PATCH", body: { title, blocks: blocks.map(toBlock) } }),
    onSuccess: () => {
      toast.success("Article enregistré, à valider.");
      onSaved();
      onOpenChange(false);
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const update = (index: number, patch: Partial<EditableBlock>) => setBlocks((list) => list.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  const move = (index: number, delta: number) =>
    setBlocks((list) => {
      const next = [...list];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item!);
      return next;
    });

  return (
    <Modal
      open={section !== null}
      onOpenChange={onOpenChange}
      title={section ? `Article ${section.number}` : "Article"}
      description={section?.intent ?? undefined}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button loading={save.isPending} disabled={!title.trim()} onClick={() => save.mutate()}>
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {error ? <InlineError>{error}</InlineError> : null}
        <Field label="Titre" value={title} onChange={(e) => setTitle(e.target.value)} />
        <ol className="grid gap-3">
          {blocks.map((block, index) => (
            <li key={index} className="rounded-xl border border-line p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-lg bg-surface-3 p-0.5" role="radiogroup" aria-label="Type de bloc">
                  {TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      role="radio"
                      aria-checked={block.type === t.value}
                      onClick={() => update(index, { type: t.value })}
                      className={cn("h-7 rounded-md px-2.5 text-2xs font-semibold", block.type === t.value ? "bg-surface text-ink shadow-card" : "text-ink-3 hover:text-ink-2")}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <span className="flex-1" />
                <button type="button" disabled={index === 0} onClick={() => move(index, -1)} className="grid size-7 place-items-center rounded-lg text-ink-3 hover:bg-surface-2 disabled:opacity-30" aria-label="Monter">
                  <ArrowUp className="size-3.5" aria-hidden="true" />
                </button>
                <button type="button" disabled={index === blocks.length - 1} onClick={() => move(index, 1)} className="grid size-7 place-items-center rounded-lg text-ink-3 hover:bg-surface-2 disabled:opacity-30" aria-label="Descendre">
                  <ArrowDown className="size-3.5" aria-hidden="true" />
                </button>
                <button type="button" onClick={() => setBlocks((list) => list.filter((_, i) => i !== index))} className="grid size-7 place-items-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-danger" aria-label="Supprimer le bloc">
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </button>
              </div>
              <textarea
                value={block.value}
                onChange={(e) => update(index, { value: e.target.value })}
                rows={block.type === "liste" ? 4 : 3}
                aria-label={block.type === "liste" ? "Éléments de la liste, un par ligne" : "Texte du bloc"}
                placeholder={block.type === "liste" ? "Un élément par ligne" : undefined}
                className="w-full resize-y rounded-lg border border-line-strong bg-surface px-3 py-2 text-xs leading-relaxed text-ink outline-none focus:border-accent"
              />
              {references.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {references.map((r) => {
                    const on = block.referenceIds.includes(r.id);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => update(index, { referenceIds: on ? block.referenceIds.filter((id) => id !== r.id) : [...block.referenceIds, r.id] })}
                        className={cn("h-6 rounded-full border px-2.5 text-2xs font-medium transition-colors", on ? "border-accent bg-accent-soft text-accent" : "border-line text-ink-3 hover:text-ink-2")}
                      >
                        {r.code}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
        <Button variant="ghost" size="sm" className="justify-self-start" icon={<Plus className="size-3.5" />} onClick={() => setBlocks((list) => [...list, { type: "paragraphe", value: "", referenceIds: [] }])}>
          Ajouter un bloc
        </Button>
      </div>
    </Modal>
  );
}
