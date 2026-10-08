import { motion } from "motion/react";
import type { ReactNode } from "react";
import { TalabSymbol, TalabWordmark } from "../components/brand/TalabMark";

/**
 * Mise en page des écrans d'accès : un panneau d'architecture sombre (logo or, arche du symbole),
 * et le formulaire sur fond blanc cassé.
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <aside className="relative hidden overflow-hidden bg-premium text-premium-ink lg:flex lg:flex-col lg:justify-between lg:p-12">
        <ArchPattern />
        <div className="relative flex items-center gap-3">
          <TalabSymbol tone="night" className="h-10" />
          <TalabWordmark tone="night" className="h-8" />
        </div>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} className="relative max-w-md">
          <p className="text-2xs font-semibold tracking-[0.2em] text-premium-accent uppercase">Talab Intelligence</p>
          <h1 className="mt-4 font-serif text-5xl leading-[1.02] font-normal">
            Le centre de contrôle
            <br />
            <em className="text-premium-accent">de vos appels d’offres.</em>
          </h1>
          <p className="mt-5 text-sm leading-relaxed text-premium-ink/65">
            Affaires, plans, CCTP, DPGF, sous-détails et devis : un seul espace, réservé à votre compte.
          </p>
        </motion.div>
        <p className="relative text-2xs text-premium-ink/45">Accès réservé. Chaque connexion est journalisée.</p>
      </aside>
      <main className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-[25rem]">
          <div className="mb-10 flex items-center gap-2.5 lg:hidden">
            <TalabSymbol className="h-9" />
            <TalabWordmark className="h-7" />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

/** Motif d'arches (inspiré du symbole) tracé à l'ouverture. Purement décoratif. */
function ArchPattern() {
  const arches = [0, 1, 2, 3, 4];
  return (
    <svg className="pointer-events-none absolute -right-24 bottom-0 h-[85%] w-auto opacity-[0.16]" viewBox="0 0 520 640" fill="none" aria-hidden="true">
      {arches.map((i) => (
        <motion.path
          key={i}
          d={`M${40 + i * 90} 640 V${300 - i * 22} Q${40 + i * 90} ${210 - i * 22} ${85 + i * 90} ${170 - i * 22} Q${130 + i * 90} ${210 - i * 22} ${130 + i * 90} ${300 - i * 22} V640`}
          stroke="currentColor"
          strokeWidth="1.2"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.6, delay: 0.15 * i, ease: [0.65, 0, 0.35, 1] }}
        />
      ))}
    </svg>
  );
}
