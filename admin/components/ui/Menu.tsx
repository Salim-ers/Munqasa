import { MoreHorizontal } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface MenuAction {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  tone?: "danger";
  disabled?: boolean;
}

/** Menu d'actions d'une ligne ou d'une fiche. */
export function ActionMenu({ actions, label = "Actions", trigger }: { actions: MenuAction[]; label?: string; trigger?: ReactNode }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        {trigger ?? (
          <button type="button" className="grid size-8 place-items-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink data-[state=open]:bg-surface-2" aria-label={label}>
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </button>
        )}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-52 rounded-card border border-line bg-surface p-1.5 shadow-lift">
          {actions.map((action) => (
            <DropdownMenu.Item
              key={action.label}
              disabled={action.disabled}
              onSelect={action.onSelect}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 [&_svg]:size-4",
                action.tone === "danger" ? "text-danger data-[highlighted]:bg-danger-soft" : "text-ink data-[highlighted]:bg-surface-2 [&_svg]:text-ink-3",
              )}
            >
              {action.icon}
              {action.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
