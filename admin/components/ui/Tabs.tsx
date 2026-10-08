import { motion } from "motion/react";
import { Tabs as RadixTabs } from "radix-ui";
import { type ReactNode, useId } from "react";
import { cn } from "../../lib/cn";

export interface TabItem {
  value: string;
  label: string;
  /** Compteur affiché à côté du libellé (ex. nombre de lots). */
  count?: number;
}

/** Onglets : l'indicateur glisse d'un onglet à l'autre ; la liste défile sur petit écran. */
export function Tabs({ value, onValueChange, items, children, className }: { value: string; onValueChange: (value: string) => void; items: TabItem[]; children: ReactNode; className?: string }) {
  const layoutId = useId();
  return (
    <RadixTabs.Root value={value} onValueChange={onValueChange} className={className}>
      <RadixTabs.List className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden" aria-label="Sections">
        {items.map((item) => {
          const active = item.value === value;
          return (
            <RadixTabs.Trigger
              key={item.value}
              value={item.value}
              className={cn(
                "relative flex h-9 shrink-0 items-center gap-2 rounded-xl px-3.5 text-xs font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent",
                active ? "text-canvas" : "text-ink-2 hover:bg-surface hover:text-ink",
              )}
            >
              {active ? <motion.span layoutId={layoutId} className="absolute inset-0 rounded-xl bg-ink" transition={{ type: "spring", stiffness: 420, damping: 34 }} aria-hidden="true" /> : null}
              <span className="relative">{item.label}</span>
              {item.count !== undefined ? (
                <span className={cn("relative rounded-md px-1.5 text-2xs tabular", active ? "bg-white/15 text-canvas" : "bg-surface-3 text-ink-3")}>{item.count}</span>
              ) : null}
            </RadixTabs.Trigger>
          );
        })}
      </RadixTabs.List>
      {children}
    </RadixTabs.Root>
  );
}

export function TabPanel({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  return (
    <RadixTabs.Content value={value} className={cn("mt-4 outline-none", className)}>
      {children}
    </RadixTabs.Content>
  );
}
