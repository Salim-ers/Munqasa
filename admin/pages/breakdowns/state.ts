import type { Breakdown } from "../../lib/types";

/** État affiché d'un sous-détail : absent, impossible à décomposer, validé, incomplet ou à valider. */
export function breakdownState(b: Breakdown | null) {
  if (!b) return { label: "Sans sous-détail", tone: "neutral" } as const;
  if (b.decomposition === "impossible") return { label: "Décomposition impossible", tone: "warning" } as const;
  if (b.components.length === 0) return { label: "Sans composant", tone: "warning" } as const;
  if (b.locked) return { label: "Validé", tone: "success" } as const;
  if (b.computedUnitPrice === null) return { label: "Incomplet", tone: "warning" } as const;
  return { label: "À valider", tone: "accent" } as const;
}
