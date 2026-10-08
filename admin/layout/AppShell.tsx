import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Dialog } from "radix-ui";
import { useEffect, useState } from "react";
import { NavLink, useLocation, useOutlet } from "react-router";
import { TalabSymbol, TalabWordmark } from "../components/brand/TalabMark";
import { cn } from "../lib/cn";
import { CommandPalette } from "./CommandPalette";
import { findNavItem, NAV } from "./nav";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

const SIDEBAR_KEY = "talab:admin:sidebar";

function readExpanded(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === "1";
  } catch {
    return false;
  }
}

/** Cadre de l'application : barre latérale, barre supérieure, contenu avec transition de page. */
export function AppShell() {
  const [expanded, setExpanded] = useState(readExpanded);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const outlet = useOutlet();
  const current = findNavItem(location.pathname);

  useEffect(() => {
    document.title = `${current?.label ?? "Administration"} · Talab Solutions`;
    setMobileOpen(false);
  }, [current?.label, location.pathname]);

  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar
        expanded={expanded}
        onToggle={() =>
          setExpanded((v) => {
            try {
              localStorage.setItem(SIDEBAR_KEY, v ? "0" : "1");
            } catch {
              /* préférence non mémorisée */
            }
            return !v;
          })
        }
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenPalette={() => setPaletteOpen(true)} onOpenMobileNav={() => setMobileOpen(true)} />
        <main id="contenu" className="flex-1 px-4 pt-5 pb-10 sm:px-6 lg:px-8">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              {outlet}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <MobileNav open={mobileOpen} onOpenChange={setMobileOpen} />
    </div>
  );
}

function MobileNav({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { pathname } = useLocation();
  const active = findNavItem(pathname);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/30 backdrop-blur-sm md:hidden" />
        <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-surface p-4 shadow-lift md:hidden">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <TalabSymbol className="h-7" />
              <TalabWordmark className="h-5" />
            </div>
            <Dialog.Close className="grid size-9 place-items-center rounded-xl text-ink-2 hover:bg-surface-2" aria-label="Fermer">
              <X className="size-5" aria-hidden="true" />
            </Dialog.Close>
          </div>
          <Dialog.Title className="sr-only">Navigation</Dialog.Title>
          <nav className="grid gap-5">
            {NAV.map((group) => (
              <div key={group.label} className="grid gap-1">
                <p className="px-3 pb-1 text-2xs font-semibold tracking-wide text-ink-3 uppercase">{group.label}</p>
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={cn("flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium", active?.to === item.to ? "bg-ink text-canvas" : "text-ink-2 hover:bg-surface-2")}
                  >
                    <item.icon className="size-[1.125rem]" strokeWidth={1.75} aria-hidden="true" />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
