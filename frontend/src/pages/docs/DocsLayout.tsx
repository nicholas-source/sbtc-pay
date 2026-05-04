import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { ExternalLink, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { DocsSidebar } from "./components/DocsSidebar";
import { OnThisPage } from "./components/OnThisPage";
import { cn } from "@/lib/utils";
import "./docs.css";

export default function DocsLayout() {
  const { pathname } = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Scroll main content to top on route change
  useEffect(() => {
    const main = document.getElementById("docs-content");
    if (main) main.scrollTo({ top: 0, behavior: "instant" });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 lg:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open docs navigation">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 overflow-y-auto border-border bg-background p-0">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <Link
                  to="/docs"
                  className="flex items-center gap-2 rounded-md transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  onClick={() => setMobileOpen(false)}
                >
                  <img src="/favicon.png" className="h-7 w-7 shrink-0 rounded-lg object-contain" alt="" aria-hidden="true" />
                  <span className="font-semibold">sBTC Pay Docs</span>
                </Link>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close navigation"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="px-2">
                <DocsSidebar onNavigate={() => setMobileOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>

          <Link
            to="/docs"
            className="flex items-center gap-2 rounded-md transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <img src="/favicon.png" className="h-7 w-7 shrink-0 rounded-lg object-contain" alt="" aria-hidden="true" />
            <span className="font-semibold tracking-tight">sBTC Pay</span>
            <span className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">
              Docs
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-2">
            <Link
              to="/"
              className="hidden text-body-sm text-muted-foreground transition hover:text-foreground sm:inline"
            >
              Home
            </Link>
            <Link
              to="/dashboard"
              className="hidden text-body-sm text-muted-foreground transition hover:text-foreground sm:inline"
            >
              Dashboard
            </Link>
            <Button asChild size="sm" className="gap-1.5">
              <a href="https://github.com/nicholas-source/sbtc-pay" target="_blank" rel="noopener noreferrer">
                GitHub <ExternalLink className="h-3 w-3" />
              </a>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 lg:flex-row lg:px-6">
        {/* Desktop left sidebar — section navigation */}
        <aside
          className={cn(
            "sticky top-14 hidden h-[calc(100svh-3.5rem)] w-64 flex-shrink-0 overflow-y-auto border-r border-border pr-4 lg:block",
          )}
          aria-label="Documentation sidebar"
        >
          <DocsSidebar />
        </aside>

        <main
          id="docs-content"
          className="min-w-0 flex-1 py-space-xl lg:py-space-2xl"
          tabIndex={-1}
        >
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <Outlet />
          </motion.div>
        </main>

        {/* Desktop right rail — on-this-page TOC */}
        <aside
          className="sticky top-14 hidden h-[calc(100svh-3.5rem)] w-56 flex-shrink-0 overflow-y-auto py-space-xl xl:block"
          aria-label="On this page"
        >
          <OnThisPage contentKey={pathname} />
        </aside>
      </div>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-6 text-caption text-muted-foreground sm:flex-row lg:px-6">
          <p>© {new Date().getFullYear()} sBTC Pay. Built on Stacks.</p>
          <div className="flex items-center gap-4">
            <Link to="/" className="hover:text-foreground">Home</Link>
            <Link to="/dashboard" className="hover:text-foreground">Dashboard</Link>
            <Link to="/docs/faq" className="hover:text-foreground">FAQ</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
