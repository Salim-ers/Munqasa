import type { CSSProperties } from "react";
import type { Photo } from "../../data/photos";
import { useAppState, type LightMode } from "../AppState";
import "./Picture.css";

interface PictureProps {
  photo: Photo;
  /** Attribut `sizes` : largeur réellement occupée à l'écran. */
  sizes: string;
  className?: string;
  /** Cadrage manuel (object-position). */
  position?: string;
  /** Image au-dessus de la ligne de flottaison : chargement immédiat. */
  priority?: boolean;
  /** "" pour une image purement décorative. */
  alt?: string;
}

/**
 * Photo responsive AVIF + WebP, dimensions réservées (pas de CLS).
 * Si une version nuit existe, les deux sont montées mais seule celle de la
 * lumière active est affichée — l'autre n'est téléchargée qu'au changement.
 */
export function Picture({ photo, sizes, className, position, priority = false, alt }: PictureProps) {
  const { mode } = useAppState();
  const style: CSSProperties | undefined = position ? { objectPosition: position } : undefined;
  const fallback = photo.widths.find((w) => w >= 1024) ?? photo.widths[photo.widths.length - 1];
  const label = alt ?? photo.alt;

  const variant = (light: LightMode) => {
    const suffix = light === "night" ? "-night" : "";
    const srcset = (ext: "avif" | "webp") => photo.widths.map((w) => `/images/photos/${photo.name}${suffix}-${w}.${ext} ${w}w`).join(", ");
    const active = !photo.night || light === mode;
    return (
      <picture key={light} className={photo.night ? `tpic__${light}` : undefined}>
        <source type="image/avif" srcSet={srcset("avif")} sizes={sizes} />
        <source type="image/webp" srcSet={srcset("webp")} sizes={sizes} />
        <img
          src={`/images/photos/${photo.name}${suffix}-${fallback}.webp`}
          width={photo.width}
          height={photo.height}
          alt={label && light === "night" ? `${label}, la nuit` : label}
          loading={priority && active ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={priority && active ? "high" : "auto"}
          style={style}
        />
      </picture>
    );
  };

  return (
    <span className={["tpic", className].filter(Boolean).join(" ")}>
      {variant("day")}
      {photo.night && variant("night")}
    </span>
  );
}
