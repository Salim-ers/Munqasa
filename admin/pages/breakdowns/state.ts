import type { Breakdown } from "../../lib/types";

/** État affiché d'un sous-détail : absent, validé, incomplet ou à valider. */
export function breakdownState(b: Breakdown | null) {
  if (!b) return { label: "Sans sous-détail", tone: "neutral" } as const;
  if (b.locked) return { label: "Validé", tone: "success" } as const;
  if (b.computedUnitPrice === null) return { label: "Incomplet", tone: "warning" } as const;
  return { label: "À valider", tone: "accent" } as const;
}
