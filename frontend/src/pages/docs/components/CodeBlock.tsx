import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

interface CodeBlockProps {
  code: string;
  language?: string;
  filename?: string;
  className?: string;
}

export function CodeBlock({ code, language, filename, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard blocked — silently fail
    }
  };

  return (
    <div className={cn("group relative my-space-lg overflow-hidden rounded-lg border border-border bg-card", className)}>
      {(filename || language) && (
        <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2">
          <div className="flex items-center gap-2 text-caption text-muted-foreground">
            {filename && <span className="font-mono">{filename}</span>}
            {!filename && language && <span className="uppercase tracking-wider">{language}</span>}
          </div>
        </div>
      )}
      <div className="relative">
        <pre className="overflow-x-auto px-4 py-4 text-body-sm leading-relaxed text-foreground/90">
          <code className="font-mono">{code}</code>
        </pre>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy code"
          className={cn(
            "absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background/80 text-muted-foreground opacity-0 backdrop-blur transition hover:bg-muted hover:text-foreground group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring",
          )}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

interface InlineCodeProps {
  children: React.ReactNode;
}

export function InlineCode({ children }: InlineCodeProps) {
  return (
    <code className="rounded border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">
      {children}
    </code>
  );
}
