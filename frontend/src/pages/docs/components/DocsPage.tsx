import { useEffect } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { PageNav } from "./PageNav";

interface DocsPageProps {
  slug: string;
  section: string;
  title: string;
  description?: string;
  children: ReactNode;
}

export function DocsPage({ slug, section, title, description, children }: DocsPageProps) {
  useEffect(() => {
    document.title = `${title} | sBTC Pay Docs`;
  }, [title]);

  return (
    <article className="mx-auto max-w-3xl">
      {/* Breadcrumb */}
      <nav className="mb-space-md flex items-center gap-1 text-caption text-muted-foreground" aria-label="Breadcrumb">
        <Link to="/docs" className="hover:text-foreground">
          Docs
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span>{section}</span>
        <ChevronRight className="h-3 w-3" />
        <span className="text-foreground">{title}</span>
      </nav>

      {/* Header */}
      <header className="mb-space-xl border-b border-border pb-space-lg">
        <h1 className="text-heading-lg font-display font-semibold tracking-tight text-foreground sm:text-display">
          {title}
        </h1>
        {description && (
          <p className="mt-3 text-body-lg text-muted-foreground">{description}</p>
        )}
      </header>

      {/* Prose content */}
      <div className="docs-prose">{children}</div>

      {/* Prev/next */}
      <PageNav slug={slug} />
    </article>
  );
}
