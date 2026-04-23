import type { ReactNode } from "react";

interface StepsProps {
  children: ReactNode;
}

export function Steps({ children }: StepsProps) {
  return <ol className="my-space-lg space-y-space-lg pl-0">{children}</ol>;
}

interface StepProps {
  number: number;
  title: string;
  children: ReactNode;
}

export function Step({ number, title, children }: StepProps) {
  return (
    <li className="relative flex gap-4 pl-0">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/10 font-mono text-body-sm font-semibold text-primary">
        {number}
      </div>
      <div className="flex-1 pt-0.5">
        <h3 className="m-0 text-heading-sm font-semibold text-foreground">{title}</h3>
        <div className="mt-2 text-body text-foreground/85 [&>p]:my-2 [&>p:first-child]:mt-0">{children}</div>
      </div>
    </li>
  );
}
