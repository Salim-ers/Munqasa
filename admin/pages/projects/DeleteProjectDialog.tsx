import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Dialog";
import { InlineError } from "../../components/ui/Feedback";
import { Field } from "../../components/ui/Field";
import { api, ApiError, errorMessage } from "../../lib/api";

/**
 * Suppression définitive d'une affaire, confirmée en saisissant sa référence. Ce qui est effacé et ce qui est
 * conservé est dit avant ; la suppression faite, la liste des affaires s'ouvre.
 */
export function DeleteProjectDialog({ open, onOpenChange, project, fileCount }: { open: boolean; onOpenChange: (open: boolean) => void; project: { id: string; reference: string; name: string }; fileCount: number }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setConfirmation("");
    setError(null);
  }, [open]);
  const matches = confirmation.trim().toUpperCase() === project.reference.toUpperCase();
  const remove = useMutation({
    mutationFn: () => api<{ reference: string; quotesKept: number }>(`/projects/${project.id}`, { method: "DELETE", body: { confirmation } }),
    onSuccess: (result) => {
      queryClient.removeQueries({ queryKey: ["project", project.id] });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["quotes"] });
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });
      toast.success(result.quotesKept ? `Affaire ${result.reference} supprimée ; ${result.quotesKept} devis conservé(s) dans le menu Devis.` : `Affaire ${result.reference} supprimée.`);
      onOpenChange(false);
      navigate("/administration/affaires");
    },
    onError: (e) => setError(e instanceof ApiError && e.fields.confirmation ? e.fields.confirmation : errorMessage(e)),
  });
  return (
    <Modal
      open={open}
      onOpenChange={(next) => !remove.isPending && onOpenChange(next)}
      title="Supprimer l’affaire"
      description={`${project.reference}, ${project.name}`}
      size="sm"
      onSubmit={(event) => {
        event.preventDefault();
        if (matches) remove.mutate();
      }}
      footer={
        <>
          <Button variant="secondary" disabled={remove.isPending} onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="submit" variant="danger" icon={<Trash2 className="size-4" />} loading={remove.isPending} disabled={!matches}>
            Supprimer définitivement
          </Button>
        </>
      }
    >
      <div className="grid gap-4 text-xs leading-relaxed text-ink-2">
        <p>La suppression est définitive : rien ne pourra être restauré.</p>
        <ul className="grid gap-1.5">
          <li>
            <span className="font-semibold text-ink">Effacés : </span>
            {`CCTP, DPGF, sous-détails, métré, lots, échéances, traitements et historique de l’affaire${fileCount ? `, ainsi que ses ${fileCount} fichier(s) déposé(s), retirés du stockage` : ""}.`}
          </li>
          <li>
            <span className="font-semibold text-ink">Conservés : </span>
            les devis de l’affaire, dans le menu Devis, détachés de l’affaire avec leurs lignes, leurs prix et leurs versions.
          </li>
        </ul>
        {error ? <InlineError>{error}</InlineError> : null}
        <Field label={`Pour confirmer, saisissez la référence ${project.reference}`} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="off" spellCheck={false} placeholder={project.reference} />
      </div>
    </Modal>
  );
}
