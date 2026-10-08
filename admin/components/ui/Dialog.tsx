import { X } from "lucide-react";
import { Dialog } from "radix-ui";
import { type FormEvent, type ReactNode, useState } from "react";
import { cn } from "../../lib/cn";
import { Button } from "./Button";

const widths = {
  sm: "sm:w-[min(26rem,calc(100vw-2rem))]",
  md: "sm:w-[min(34rem,calc(100vw-2rem))]",
  lg: "sm:w-[min(46rem,calc(100vw-2rem))]",
};

export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: keyof typeof widths;
  /** Fenêtre de formulaire : le contenu et le pied forment un seul formulaire. */
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
}

/** Fenêtre modale : centrée sur grand écran, feuille montante sur téléphone. */
export function Modal({ open, onOpenChange, title, description, children, footer, size = "md", onSubmit }: ModalProps) {
  const body = (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">{children}</div>
      {footer ? (
        <div className="flex flex-col-reverse gap-2 border-t border-line px-5 py-4 sm:flex-row sm:justify-end sm:px-6 [&>button]:w-full sm:[&>button]:w-auto">{footer}</div>
      ) : null}
    </>
  );
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/30 backdrop-blur-sm data-[state=closed]:animate-[talab-fade-out_160ms_ease-in_forwards] data-[state=open]:animate-[talab-fade-in_200ms_ease-out]" />
        <Dialog.Content
          className={cn(
            "fixed z-50 flex max-h-[92vh] flex-col bg-surface shadow-lift outline-none supports-[height:100dvh]:max-h-[92dvh]",
            "inset-x-0 bottom-0 rounded-t-[1.25rem] pb-[env(safe-area-inset-bottom)] data-[state=closed]:animate-[talab-sheet-out_200ms_ease-in_forwards] data-[state=open]:animate-[talab-sheet-in_280ms_cubic-bezier(0.22,1,0.36,1)]",
            "sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-card sm:pb-0 sm:data-[state=closed]:animate-[talab-pop-out_160ms_ease-in_forwards] sm:data-[state=open]:animate-[talab-pop-in_240ms_cubic-bezier(0.22,1,0.36,1)]",
            widths[size],
          )}
        >
          <div className="flex items-start gap-4 border-b border-line px-5 pt-5 pb-4 sm:px-6">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-base font-semibold text-ink">{title}</Dialog.Title>
              {description ? <Dialog.Description className="mt-1 text-xs leading-relaxed text-ink-3">{description}</Dialog.Description> : <Dialog.Description className="sr-only">{title}</Dialog.Description>}
            </div>
            <Dialog.Close className="-mt-1 -mr-2 grid size-9 shrink-0 place-items-center rounded-xl text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Fermer">
              <X className="size-[1.125rem]" aria-hidden="true" />
            </Dialog.Close>
          </div>
          {onSubmit ? (
            <form noValidate onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
              {body}
            </form>
          ) : (
            body
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Confirmation d'une action irréversible ou importante. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  text,
  confirmLabel,
  tone = "danger",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  text: ReactNode;
  confirmLabel: string;
  tone?: "danger" | "primary";
  onConfirm: () => Promise<unknown> | void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open={open}
      onOpenChange={(v) => !busy && onOpenChange(v)}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Annuler
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                onOpenChange(false);
              } catch {
                // L'appelant affiche l'erreur ; la fenêtre reste ouverte pour réessayer.
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm leading-relaxed text-ink-2">{text}</div>
    </Modal>
  );
}
