import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type AccentColor = "primary" | "secondary" | "success" | "warning" | "destructive" | "info";

const iconColorMap: Record<AccentColor, string> = {
  primary: "bg-primary/15 text-primary",
  secondary: "bg-secondary/15 text-secondary",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  destructive: "bg-destructive/15 text-destructive",
  info: "bg-info/15 text-info",
};

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  accent?: AccentColor;
}

export default function EmptyState({ icon: Icon, title, description, action, accent = "primary" }: EmptyStateProps) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <div className={cn("flex h-14 w-14 items-center justify-center rounded-full mb-4 animate-scale-in", iconColorMap[accent])}>
          <Icon className="h-7 w-7" />
        </div>
        <h3 className="text-heading-sm text-foreground">{title}</h3>
        <p className="text-body-sm text-muted-foreground mt-1 max-w-sm">{description}</p>
        {action && <div className="mt-4">{action}</div>}
      </CardContent>
    </Card>
  );
}
