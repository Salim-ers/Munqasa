import { ArrowRight, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { TransitionLink } from "../TransitionLink/TransitionLink";
import "./CtaLink.css";

interface CtaLinkProps {
  to: string;
  children: ReactNode;
  variant?: "solid" | "outline" | "text";
  /** Flèche diagonale (action) ou horizontale (navigation). */
  arrow?: "up-right" | "right";
  className?: string;
}

export function CtaLink({ to, children, variant = "solid", arrow = "up-right", className }: CtaLinkProps) {
  const Icon = arrow === "right" ? ArrowRight : ArrowUpRight;
  return (
    <TransitionLink to={to} className={["cta", `cta--${variant}`, className].filter(Boolean).join(" ")} data-cursor="cta">
      <span className="cta__label">{children}</span>
      <span className="cta__icon" aria-hidden="true">
        <Icon size={16} strokeWidth={1.5} />
      </span>
    </TransitionLink>
  );
}
