import { useRef, useEffect, useCallback, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ScrollableTableProps {
  children: ReactNode;
  className?: string;
  label?: string;
}

/**
 * Wrapper for tables that need horizontal scroll on mobile.
 * Shows a right-edge fade gradient when content overflows.
 */
export function ScrollableTable({ children, className, label }: ScrollableTableProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const updateState = useCallback(() => {
    const container = containerRef.current;
    const scroller = scrollRef.current;
    if (!container || !scroller) return;

    const isOverflowing = scroller.scrollWidth > scroller.clientWidth;
    const isAtEnd = scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 2;

    container.classList.toggle("is-overflowing", isOverflowing);
    container.classList.toggle("scrolled-end", isAtEnd);
  }, []);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;

    updateState();
    scroller.addEventListener("scroll", updateState, { passive: true });
    const observer = new ResizeObserver(updateState);
    observer.observe(scroller);

    return () => {
      scroller.removeEventListener("scroll", updateState);
      observer.disconnect();
    };
  }, [updateState]);

  return (
    <div
      ref={containerRef}
      className={cn("table-scroll-container rounded-lg border overflow-hidden", className)}
    >
      <div
        ref={scrollRef}
        className="overflow-x-auto"
        role="region"
        aria-label={label ?? "Scrollable table"}
        tabIndex={0}
      >
        {children}
      </div>
    </div>
  );
}
