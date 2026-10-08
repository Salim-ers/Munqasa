import { useQueryClient } from "@tanstack/react-query";
import { Command } from "cmdk";
import { CornerDownLeft, LogOut, Moon, Sun } from "lucide-react";
import { useEffect } from "react";
import { useNavigate } from "react-router";
import { authClient } from "../lib/auth-client";
import { setLight, useLight } from "../lib/theme";
import { NAV } from "./nav";

const itemClass =
  "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-[0.8125rem] font-medium text-ink-2 outline-none data-[selected=true]:bg-surface-2 data-[selected=true]:text-ink";

/** Palette de commandes (Ctrl / ⌘ K) : navigation et actions réelles uniquement. */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const light = useLight();
  const queryClient = useQueryClient();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const run = (action: () => void) => {
    onOpenChange(false);
    action();
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Palette de commandes"
      overlayClassName="fixed inset-0 z-50 bg-ink/25 backdrop-blur-sm"
      contentClassName="fixed top-[16vh] left-1/2 z-50 w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-card border border-line bg-surface shadow-lift"
    >
      <Command.Input placeholder="Aller à… ou rechercher une action" className="h-14 w-full border-b border-line bg-transparent px-5 text-sm text-ink outline-none placeholder:text-ink-3" />
      <Command.List className="max-h-[50vh] overflow-y-auto p-2">
        <Command.Empty className="px-3 py-8 text-center text-xs text-ink-3">Aucun résultat.</Command.Empty>
        {NAV.map((group) => (
          <Command.Group key={group.label} heading={group.label} className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-ink-3 [&_[cmdk-group-heading]]:uppercase">
            {group.items.map((item) => (
              <Command.Item key={item.to} value={`${item.label} ${(item.keywords ?? []).join(" ")}`} onSelect={() => run(() => navigate(item.to))} className={itemClass}>
                <item.icon className="size-4 text-ink-3" strokeWidth={1.75} aria-hidden="true" />
                {item.label}
                <CornerDownLeft className="ml-auto size-3.5 text-ink-3 opacity-0 [[data-selected=true]_&]:opacity-100" aria-hidden="true" />
              </Command.Item>
            ))}
          </Command.Group>
        ))}
        <Command.Group heading="Actions" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-ink-3 [&_[cmdk-group-heading]]:uppercase">
          <Command.Item value="lumière jour nuit thème" onSelect={() => run(() => setLight(light === "night" ? "day" : "night"))} className={itemClass}>
            {light === "night" ? <Sun className="size-4 text-ink-3" aria-hidden="true" /> : <Moon className="size-4 text-ink-3" aria-hidden="true" />}
            {light === "night" ? "Passer en jour" : "Passer en nuit"}
          </Command.Item>
          <Command.Item
            value="se déconnecter quitter"
            onSelect={() =>
              run(async () => {
                await authClient.signOut();
                queryClient.clear();
                navigate("/administration/connexion", { replace: true });
              })
            }
            className={itemClass}
          >
            <LogOut className="size-4 text-ink-3" aria-hidden="true" />
            Se déconnecter
          </Command.Item>
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
