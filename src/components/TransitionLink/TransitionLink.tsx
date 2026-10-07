import type { MouseEvent } from "react";
import { Link, type LinkProps } from "react-router";
import { usePageTransition } from "../PageTransition/PageTransition";

type Props = Omit<LinkProps, "to"> & { to: string };

/** Lien interne qui passe par la transition de page (clics modifiés : natifs). */
export function TransitionLink({ to, onClick, target, ...rest }: Props) {
  const { go } = usePageTransition();

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || target === "_blank") return;
    e.preventDefault();
    go(to);
  }

  return <Link to={to} target={target} onClick={handleClick} {...rest} />;
}
