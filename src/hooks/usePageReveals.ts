import { useRef } from "react";
import { applyReveals } from "../animations/reveal";
import { useGsap } from "./useGsap";

/** Ref à poser sur la racine d'une page : active ses attributs data-reveal. */
export function usePageReveals<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  useGsap(({ reduced, scope }) => applyReveals(scope, reduced), ref);
  return ref;
}
