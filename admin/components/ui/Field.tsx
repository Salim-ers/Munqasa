import { Eye, EyeOff } from "lucide-react";
import { forwardRef, type InputHTMLAttributes, type ReactNode, useId, useState } from "react";
import { cn } from "../../lib/cn";

const inputBase =
  "h-11 w-full rounded-field border border-line-strong bg-surface px-3.5 text-sm text-ink placeholder:text-ink-3 outline-none transition-[border-color,box-shadow] focus:border-accent focus:shadow-[0_0_0_4px_var(--accent-soft)] aria-[invalid=true]:border-danger";

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field({ label, hint, error, className, id, ...rest }, ref) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;
  return (
    <div className={cn("grid gap-1.5", className)}>
      <label htmlFor={inputId} className="text-xs font-semibold text-ink-2">
        {label}
      </label>
      <input ref={ref} id={inputId} className={inputBase} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...rest} />
      {error ? (
        <p id={`${inputId}-error`} className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-xs text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
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

export function Checkbox({ label, checked, onChange }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex cursor-pointer select-none items-center gap-2.5 text-xs text-ink-2">
      <input id={id} type="checkbox" className="size-4 accent-[var(--accent)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
