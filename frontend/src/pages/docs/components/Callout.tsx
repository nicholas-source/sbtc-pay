import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";

type CalloutVariant = "info" | "tip" | "warning" | "success";

const VARIANT_STYLES: Record<CalloutVariant, { icon: typeof Info; border: string; bg: string; iconColor: string }> = {
  info: {
    icon: Info,
    border: "border-info/40",
    bg: "bg-info/5",
    iconColor: "text-info",
  },
  tip: {
    icon: Lightbulb,
    border: "border-primary/40",
    bg: "bg-primary/5",
    iconColor: "text-primary",
  },
  warning: {
    icon: AlertCircle,
    border: "border-warning/40",
    bg: "bg-warning/5",
    iconColor: "text-warning",
  },
  success: {
    icon: CheckCircle2,
    border: "border-success/40",
    bg: "bg-success/5",
    iconColor: "text-success",
  },
};

interface CalloutProps {
  variant?: CalloutVariant;
  title?: string;
  children: ReactNode;
}

export function Callout({ variant = "info", title, children }: CalloutProps) {
  const { icon: Icon, border, bg, iconColor } = VARIANT_STYLES[variant];

  return (
    <div className={cn("my-space-lg flex gap-3 rounded-lg border p-4", border, bg)}>
      <Icon className={cn("mt-0.5 h-5 w-5 flex-shrink-0", iconColor)} aria-hidden="true" />
      <div className="flex-1 space-y-1">
        {title && <p className="font-semibold text-foreground">{title}</p>}
        <div className="text-body-sm text-foreground/85 [&>p]:my-0 [&>p+p]:mt-2">{children}</div>
      </div>
    </div>
  );
}
