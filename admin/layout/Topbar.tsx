import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Menu, Moon, Search, ShieldCheck, Sun } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { Link, useLocation, useNavigate } from "react-router";
import { TalabSymbol } from "../components/brand/TalabMark";
import { authClient } from "../lib/auth-client";
import { setLight, useLight } from "../lib/theme";
import { ME_KEY, useMe } from "../lib/session";
import { findNavItem } from "./nav";

export function Topbar({ onOpenPalette, onOpenMobileNav }: { onOpenPalette: () => void; onOpenMobileNav: () => void }) {
  const { pathname } = useLocation();
  const current = findNavItem(pathname);
  const light = useLight();
  const me = useMe();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const initials = (me.data?.user.email ?? "A").slice(0, 1).toUpperCase();

  async function signOut() {
    await authClient.signOut();
    queryClient.clear();
    navigate("/administration/connexion", { replace: true });
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-canvas/80 px-4 backdrop-blur-xl sm:px-6">
      <button type="button" onClick={onOpenMobileNav} className="grid size-9 place-items-center rounded-xl text-ink-2 hover:bg-surface md:hidden" aria-label="Ouvrir la navigation">
        <Menu className="size-5" aria-hidden="true" />
      </button>
      <TalabSymbol className="h-6 md:hidden" />
      <nav aria-label="Fil d’Ariane" className="hidden min-w-0 items-center gap-2 text-xs sm:flex">
        <Link to="/administration/dashboard" className="font-medium text-ink-3 hover:text-ink">
          Talab Intelligence
        </Link>
        <span className="text-ink-3" aria-hidden="true">
          /
        </span>
        <span className="truncate font-semibold text-ink" aria-current="page">
          {current?.label ?? "Administration"}
        </span>
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenPalette}
          className="hidden h-9 w-64 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-xs text-ink-3 transition-colors hover:border-line-strong hover:text-ink-2 lg:flex"
        >
          <Search className="size-4" aria-hidden="true" />
          Rechercher, naviguer…
          <kbd className="ml-auto rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-sans text-2xs text-ink-3">{isMac ? "⌘" : "Ctrl"} K</kbd>
        </button>
        <button type="button" onClick={onOpenPalette} className="grid size-9 place-items-center rounded-xl text-ink-2 hover:bg-surface lg:hidden" aria-label="Rechercher">
          <Search className="size-[1.125rem]" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => setLight(light === "night" ? "day" : "night")}
          className="grid size-9 place-items-center rounded-xl text-ink-2 hover:bg-surface hover:text-ink"
          aria-label={light === "night" ? "Passer en jour" : "Passer en nuit"}
        >
          {light === "night" ? <Sun className="size-[1.125rem]" aria-hidden="true" /> : <Moon className="size-[1.125rem]" aria-hidden="true" />}
        </button>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button type="button" className="grid size-9 place-items-center rounded-full bg-ink text-xs font-semibold text-canvas ring-offset-2 ring-offset-canvas hover:ring-2 hover:ring-line-strong" aria-label="Menu du compte">
              {initials}
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={8} className="z-50 min-w-60 rounded-card border border-line bg-surface p-1.5 shadow-lift">
              <div className="px-2.5 py-2">
                <p className="text-2xs font-semibold tracking-wide text-ink-3 uppercase">Connecté</p>
                <p className="mt-0.5 truncate text-xs font-medium text-ink">{me.data?.user.email}</p>
              </div>
              <DropdownMenu.Separator className="my-1 h-px bg-line" />
              <DropdownMenu.Item asChild>
                <Link to="/administration/securite" className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-ink outline-none data-[highlighted]:bg-surface-2">
                  <ShieldCheck className="size-4 text-ink-3" aria-hidden="true" />
                  Sécurité et sessions
                </Link>
              </DropdownMenu.Item>
              <DropdownMenu.Item onSelect={() => void signOut()} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-danger outline-none data-[highlighted]:bg-danger-soft">
                <LogOut className="size-4" aria-hidden="true" />
                Se déconnecter
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
      <span className="sr-only" aria-live="polite">
        {queryClient.isFetching({ queryKey: ME_KEY }) ? "Actualisation" : ""}
      </span>
    </header>
  );
}
