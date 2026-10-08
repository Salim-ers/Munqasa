import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/cn";

/** Recherche avec temporisation : la requête part 300 ms après la dernière frappe. */
export function SearchInput({ value, onChange, placeholder, className, label }: { value: string; onChange: (value: string) => void; placeholder: string; className?: string; label: string }) {
  const [text, setText] = useState(value);
  const latest = useRef(onChange);
  latest.current = onChange;

  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (text === value) return;
    const timer = window.setTimeout(() => latest.current(text.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [text, value]);

  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
      <input
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="h-10 w-full rounded-xl border border-line bg-surface pr-9 pl-9 text-xs text-ink outline-none placeholder:text-ink-3 focus:border-accent focus:shadow-[0_0_0_4px_var(--accent-soft)] [&::-webkit-search-cancel-button]:hidden"
      />
      {text ? (
        <button
          type="button"
          onClick={() => {
            setText("");
            onChange("");
          }}
          className="absolute top-1/2 right-1.5 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink"
          aria-label="Effacer la recherche"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
