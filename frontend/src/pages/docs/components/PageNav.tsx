import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { getDocsSiblings } from "../nav";

interface PageNavProps {
  slug: string;
}

export function PageNav({ slug }: PageNavProps) {
  const { prev, next } = getDocsSiblings(slug);

  if (!prev && !next) return null;

  return (
    <nav className="mt-space-2xl grid grid-cols-1 gap-3 border-t border-border pt-space-xl sm:grid-cols-2" aria-label="Page navigation">
      {prev ? (
        <Link
          to={`/docs${prev.slug ? `/${prev.slug}` : ""}`}
          className="group flex flex-col gap-1 rounded-lg border border-border bg-card p-4 transition hover:border-primary/60 hover:bg-card/80"
        >
          <span className="inline-flex items-center gap-1 text-caption text-muted-foreground">
            <ArrowLeft className="h-3 w-3" /> Previous
          </span>
          <span className="text-body-sm font-semibold text-foreground group-hover:text-primary">{prev.title}</span>
        </Link>
      ) : (
        <div />
      )}
      {next ? (
        <Link
          to={`/docs${next.slug ? `/${next.slug}` : ""}`}
          className="group flex flex-col gap-1 rounded-lg border border-border bg-card p-4 text-right transition hover:border-primary/60 hover:bg-card/80 sm:ml-auto"
        >
          <span className="inline-flex items-center justify-end gap-1 text-caption text-muted-foreground">
            Next <ArrowRight className="h-3 w-3" />
          </span>
          <span className="text-body-sm font-semibold text-foreground group-hover:text-primary">{next.title}</span>
        </Link>
      ) : (
        <div />
      )}
    </nav>
  );
}
