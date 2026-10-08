import { ChevronDown, Eye, EyeOff } from "lucide-react";
import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes, useId, useState } from "react";
import { cn } from "../../lib/cn";

const inputCore =
  "w-full rounded-field border border-line-strong bg-surface px-3.5 text-sm text-ink placeholder:text-ink-3 outline-none transition-[border-color,box-shadow] focus:border-accent focus:shadow-[0_0_0_4px_var(--accent-soft)] aria-[invalid=true]:border-danger disabled:opacity-60";
export const inputBase = `${inputCore} h-11`;

/** Libellé, aide et message d'erreur communs à tous les champs. */
function FieldShell({ id, label, hint, error, optional, className, children }: { id: string; label: string; hint?: ReactNode; error?: string | null; optional?: boolean; className?: string; children: ReactNode }) {
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <label htmlFor={id} className="flex items-baseline justify-between gap-2 text-xs font-semibold text-ink-2">
        {label}
        {optional ? <span className="text-2xs font-medium text-ink-3">Facultatif</span> : null}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
}

export const Field = forwardRef<HTMLInputElement, FieldProps & { optional?: boolean }>(function Field({ label, hint, error, optional, className, id, ...rest }, ref) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;
  return (
    <FieldShell id={inputId} label={label} hint={hint} error={error} optional={optional} className={className}>
      <input ref={ref} id={inputId} className={inputBase} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...rest} />
    </FieldShell>
  );
});

export const PasswordField = forwardRef<HTMLInputElement, Omit<FieldProps, "type">>(function PasswordField({ label, error, hint, className, id, ...rest }, ref) {
  const [visible, setVisible] = useState(false);
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className={cn("grid gap-1.5", className)}>
      <label htmlFor={inputId} className="text-xs font-semibold text-ink-2">
        {label}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          type={visible ? "text" : "password"}
          className={cn(inputBase, "pr-11")}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-0 grid w-11 place-items-center text-ink-3 hover:text-ink"
          aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          aria-pressed={visible}
        >
          {visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
        </button>
      </div>
      {error ? (
        <p id={`${inputId}-error`} className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
});

export interface TextareaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
}

export const TextareaField = forwardRef<HTMLTextAreaElement, TextareaFieldProps>(function TextareaField({ label, hint, error, optional, className, id, rows = 4, ...rest }, ref) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <FieldShell id={inputId} label={label} hint={hint} error={error} optional={optional} className={className}>
      <textarea
        ref={ref}
        id={inputId}
        rows={rows}
        className={cn(inputCore, "min-h-24 resize-y py-2.5 leading-relaxed")}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
        {...rest}
      />
    </FieldShell>
  );
});

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
  options: ReadonlyArray<{ value: string; label: string }>;
  /** Première option vide (ex. « Aucun client »). */
  placeholder?: string;
}

/** Liste native : accessible, adaptée au tactile et à tous les navigateurs. */
export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField({ label, hint, error, optional, options, placeholder, className, id, ...rest }, ref) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <FieldShell id={inputId} label={label} hint={hint} error={error} optional={optional} className={className}>
      <div className="relative">
        <select
          ref={ref}
          id={inputId}
          className={cn(inputBase, "appearance-none pr-10")}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          {...rest}
        >
          {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
      </div>
    </FieldShell>
  );
});

/** Options d'une liste à partir d'un dictionnaire de libellés. */
export function optionsOf<K extends string>(labels: Record<K, string>, keys?: readonly K[]): Array<{ value: K; label: string }> {
  return (keys ?? (Object.keys(labels) as K[])).map((value) => ({ value, label: labels[value] }));
}

export function Checkbox({ label, checked, onChange }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex cursor-pointer select-none items-center gap-2.5 text-xs text-ink-2">
      <input id={id} type="checkbox" className="size-4 accent-[var(--accent)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
