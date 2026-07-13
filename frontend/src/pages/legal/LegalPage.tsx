import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import LandingFooter from "@/components/landing/LandingFooter";
import { PageTransition } from "@/components/layout/PageTransition";
import { setTitleAndDescription } from "@/lib/seo";
import "@/pages/docs/docs.css";

interface LegalPageProps {
  title: string;
  description: string;
  updated: string;
  children: ReactNode;
}

/**
 * Shared shell for /privacy and /terms. Deliberately minimal chrome — a
 * document header instead of the landing navbar, whose #section anchors
 * would dead-end off the landing page. Canonical + robots come from
 * RouteAnnouncer; title/description are set here (its effect runs later).
 */
export function LegalPage({ title, description, updated, children }: LegalPageProps) {
  useEffect(() => {
    setTitleAndDescription(`${title} | sBTC Pay`, description);
  }, [title, description]);

  return (
    <PageTransition>
      <div className="min-h-svh bg-background text-foreground flex flex-col">
        <a href="#main-content" className="skip-link">Skip to main content</a>
        <header aria-label="Site header" className="border-b border-border/50">
          <div className="container flex h-14 sm:h-16 items-center justify-between">
            <Link
              to="/"
              className="flex items-center gap-2.5 rounded-lg transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <img
                src="/icon-192.png"
                className="h-9 w-9 shrink-0 rounded-xl object-contain"
                alt="sBTC Pay home"
              />
              <span className="text-base font-display font-bold leading-none">sBTC Pay</span>
            </Link>
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-body-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" /> Back to home
            </Link>
          </div>
        </header>

        <main id="main-content" className="flex-1">
          <article className="container max-w-3xl py-10 sm:py-14">
            <header className="mb-8 border-b border-border pb-6">
              <h1 className="text-heading-lg font-display font-semibold tracking-tight text-foreground sm:text-display">
                {title}
              </h1>
              <p className="mt-3 text-body-sm text-muted-foreground">Last updated: {updated}</p>
            </header>
            <div className="docs-prose">{children}</div>
          </article>
        </main>

        <LandingFooter />
      </div>
    </PageTransition>
  );
}
