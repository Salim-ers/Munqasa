import type { CSSProperties } from "react";
import type { Photo } from "../../data/photos";

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

const srcset = (p: Photo, ext: "avif" | "webp") =>
  p.widths.map((w) => `/images/photos/${p.name}-${w}.${ext} ${w}w`).join(", ");

/** Photo responsive AVIF + WebP, dimensions réservées (pas de CLS). */
export function Picture({ photo, sizes, className, position, priority = false, alt }: PictureProps) {
  const fallback = photo.widths.find((w) => w >= 1024) ?? photo.widths.at(-1);
  const style: CSSProperties | undefined = position ? { objectPosition: position } : undefined;
  return (
    <picture className={className}>
      <source type="image/avif" srcSet={srcset(photo, "avif")} sizes={sizes} />
      <source type="image/webp" srcSet={srcset(photo, "webp")} sizes={sizes} />
      <img
        src={`/images/photos/${photo.name}-${fallback}.webp`}
        width={photo.width}
        height={photo.height}
        alt={alt ?? photo.alt}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={priority ? "high" : "auto"}
        style={style}
      />
    </picture>
  );
}
