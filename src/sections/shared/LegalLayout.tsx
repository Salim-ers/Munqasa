import type { ReactNode } from "react";
import { Tag } from "../../components/Tag/Tag";
import { usePageReveals } from "../../hooks/usePageReveals";
import "./LegalLayout.css";

interface LegalLayoutProps {
  tag: string;
  title: string;
  children: ReactNode;
}

/** Gabarit sobre pour les pages juridiques. */
export function LegalLayout({ tag, title, children }: LegalLayoutProps) {
  const ref = usePageReveals();
  return (
    <div ref={ref}>
      <section className="legal tone-1 has-grain" aria-labelledby="page-title">
        <div className="legal__inner container">
          <header className="legal__head">
            <Tag>{tag}</Tag>
            <h1 id="page-title" className="display-lg" data-reveal="lines">
              {title}
            </h1>
          </header>
          <div className="legal__body prose">{children}</div>
        </div>
      </section>
    </div>
  );
}

/** Information à fournir par Talab Solutions avant la mise en ligne, jamais inventée. */
export function ToComplete({ children }: { children: ReactNode }) {
  return <span className="to-complete">{children} (à compléter)</span>;
}
