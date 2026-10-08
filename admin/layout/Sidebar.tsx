import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { motion } from "motion/react";
import { Tooltip } from "radix-ui";
import { NavLink, useLocation } from "react-router";
import { TalabSymbol, TalabWordmark } from "../components/brand/TalabMark";
import { cn } from "../lib/cn";
import { findNavItem, NAV } from "./nav";

/** Barre latérale fine (icônes), dépliable avec libellés. L'indicateur actif glisse d'un module à l'autre. */
export function Sidebar({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  const { pathname } = useLocation();
  const active = findNavItem(pathname);
  return (
    <Tooltip.Provider delayDuration={150}>
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-line bg-surface/70 py-4 backdrop-blur-xl transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] md:flex",
          expanded ? "w-60 px-3" : "w-[4.5rem] px-3",
        )}
        aria-label="Navigation de l’administration"
      >
        <div className={cn("mb-6 flex h-10 items-center gap-2.5", expanded ? "px-2" : "justify-center")}>
          <TalabSymbol className="h-7" />
          {expanded ? <TalabWordmark className="h-5" /> : null}
        </div>
        <nav className="flex flex-1 flex-col gap-5 overflow-y-auto">
          {NAV.map((group) => (
            <div key={group.label} className="grid gap-1">
              {expanded ? <p className="px-3 pb-1 text-2xs font-semibold tracking-wide text-ink-3 uppercase">{group.label}</p> : <div className="mx-auto mb-1 h-px w-6 bg-line" aria-hidden="true" />}
              {group.items.map((item) => {
                const isActive = active?.to === item.to;
                const link = (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "relative flex h-10 items-center gap-3 rounded-xl text-[0.8125rem] font-medium transition-colors",
                      expanded ? "px-3" : "justify-center",
                      isActive ? "text-canvas" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                    )}
                  >
                    {isActive ? (
                      <motion.span layoutId="sidebar-active" className="absolute inset-0 rounded-xl bg-ink" transition={{ type: "spring", stiffness: 420, damping: 34 }} aria-hidden="true" />
                    ) : null}
                    <item.icon className="relative size-[1.125rem] shrink-0" strokeWidth={1.75} aria-hidden="true" />
                    {expanded ? <span className="relative truncate">{item.label}</span> : <span className="sr-only">{item.label}</span>}
                  </NavLink>
                );
                return expanded ? (
                  link
                ) : (
                  <Tooltip.Root key={item.to}>
                    <Tooltip.Trigger asChild>{link}</Tooltip.Trigger>
                    <Tooltip.Portal>
                      <Tooltip.Content side="right" sideOffset={10} className="z-50 rounded-lg bg-ink px-2.5 py-1.5 text-xs font-medium text-canvas shadow-lift">
                        {item.label}
                      </Tooltip.Content>
                    </Tooltip.Portal>
                  </Tooltip.Root>
                );
              })}
            </div>
          ))}
        </nav>
        <button
          type="button"
          onClick={onToggle}
          className={cn("mt-4 flex h-10 items-center gap-3 rounded-xl text-xs font-medium text-ink-3 hover:bg-surface-2 hover:text-ink", expanded ? "px-3" : "justify-center")}
          aria-label={expanded ? "Replier la barre latérale" : "Déplier la barre latérale"}
          aria-expanded={expanded}
        >
          {expanded ? <PanelLeftClose className="size-[1.125rem]" strokeWidth={1.75} aria-hidden="true" /> : <PanelLeftOpen className="size-[1.125rem]" strokeWidth={1.75} aria-hidden="true" />}
          {expanded ? "Replier" : null}
        </button>
      </aside>
    </Tooltip.Provider>
  );
}
