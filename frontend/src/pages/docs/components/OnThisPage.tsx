import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Heading = { id: string; text: string; level: 2 | 3 };

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

/**
 * Scans the docs content area for h2/h3 headings, assigns ids if missing,
 * and renders a scroll-spy table of contents in the right rail.
 *
 * Re-runs whenever `contentKey` changes (i.e., on route change).
 */
export function OnThisPage({ contentKey }: { contentKey: string }) {
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Collect headings after the page renders
  // Use rAF so Suspense-lazy content has finished painting before we query
  useEffect(() => {
    let rafId: number;
    let timeoutId: ReturnType<typeof setTimeout>;

    const collect = () => {
      const root = document.querySelector(".docs-prose");
      if (!root) {
        setHeadings([]);
        setActiveId(null);
        return;
      }

      const nodes = Array.from(root.querySelectorAll("h2, h3"));
      const collected: Heading[] = [];
      const used = new Set<string>();

      for (const node of nodes) {
        const el = node as HTMLHeadingElement;
        const text = el.textContent?.trim() ?? "";
        if (!text) continue;

        let id = el.id || slugify(text);
        // Ensure uniqueness within the page
        let suffix = 2;
        let unique = id;
        while (used.has(unique)) {
          unique = `${id}-${suffix++}`;
        }
        id = unique;
        used.add(id);

        if (!el.id) el.id = id;
        collected.push({
          id,
          text,
          level: el.tagName === "H3" ? 3 : 2,
        });
      }

      setHeadings(collected);
      // Pre-select the first heading so the TOC is never blank on load
      if (collected.length > 0) setActiveId(collected[0].id);
    };

    // Double-rAF ensures the browser has painted after Suspense resolves
    rafId = requestAnimationFrame(() => {
      rafId = requestAnimationFrame(collect);
    });

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timeoutId);
    };
  }, [contentKey]);

  // Scroll-spy: track which heading is in view
  // When a heading leaves the top of the viewport, keep it active until
  // the next one enters so the TOC never goes blank mid-scroll.
  useEffect(() => {
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Find headings newly entering the observation zone
        const entering = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

        if (entering.length > 0) {
          setActiveId(entering[0].target.id);
          return;
        }

        // Nothing is entering — figure out which heading the user scrolled past
        // by finding the last heading whose top is above the fold
        const above = headings
          .map((h) => document.getElementById(h.id))
          .filter((el): el is HTMLElement => !!el)
          .filter((el) => el.getBoundingClientRect().top < 80);

        if (above.length > 0) {
          setActiveId(above[above.length - 1].id);
        }
      },
      {
        rootMargin: "-80px 0px -70% 0px",
        threshold: [0, 1],
      },
    );

    const targets = headings
      .map((h) => document.getElementById(h.id))
      .filter((el): el is HTMLElement => !!el);

    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [headings]);

  if (headings.length < 2) return null;

  return (
    <nav className="text-body-sm" aria-label="On this page">
      <p className="mb-space-sm text-caption font-semibold uppercase tracking-wider text-muted-foreground">
        On this page
      </p>
      <ul className="flex flex-col gap-1 border-l border-border">
        {headings.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              className={cn(
                "block border-l-2 py-1 text-body-sm transition-colors",
                h.level === 3 ? "pl-6" : "pl-3",
                activeId === h.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
