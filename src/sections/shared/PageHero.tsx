import type { ReactNode } from "react";
import { Picture } from "../../components/Picture/Picture";
import { Tag } from "../../components/Tag/Tag";
import { photo, type PhotoName } from "../../data/photos";
import { archPolygon } from "../../lib/arch";
import "./PageHero.css";

interface PageHeroProps {
  tag: string;
  /** Une entrée par ligne du titre. */
  lines: ReactNode[];
  intro: string;
  image: PhotoName;
  imagePosition?: string;
  /** Découpe de la photographie : arche (inspirée du logo) ou cadre droit. */
  frame?: "arch" | "rect";
  children?: ReactNode;
}

const ARCH = archPolygon(32);

export function PageHero({ tag, lines, intro, image, imagePosition, frame = "rect", children }: PageHeroProps) {
  return (
    <section className="page-hero tone-1 has-grain" aria-labelledby="page-title">
      <div className="page-hero__inner container">
        <div className="page-hero__text">
          <Tag>{tag}</Tag>
          <h1 id="page-title" className="display-xl page-hero__title" data-reveal="lines">
            {lines.map((line, i) => (
              <span key={i} className="display-line">
                {line}
              </span>
            ))}
          </h1>
          <p className="lead page-hero__intro" data-reveal="fade" data-reveal-delay="0.2">
            {intro}
          </p>
          {children}
        </div>

        <figure className={`page-hero__figure page-hero__figure--${frame}`}>
          <div className="page-hero__media" data-reveal="image" data-cursor="voir">
            <div className="page-hero__clip" style={frame === "arch" ? { clipPath: ARCH } : undefined}>
              <Picture photo={photo(image)} sizes="(min-width: 1024px) 40vw, 100vw" position={imagePosition} priority />
            </div>
          </div>
        </figure>
      </div>
    </section>
  );
}
