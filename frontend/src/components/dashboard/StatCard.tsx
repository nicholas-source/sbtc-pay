import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type AccentColor = "primary" | "secondary" | "success" | "warning" | "destructive" | "info";

const iconBgMap: Record<AccentColor, string> = {
  primary: "bg-primary/15 text-primary",
  secondary: "bg-secondary/15 text-secondary",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  destructive: "bg-destructive/15 text-destructive",
  info: "bg-info/15 text-info",
};

const accentBorderMap: Record<AccentColor, string> = {
  primary: "card-accent-primary",
  secondary: "card-accent-secondary",
  success: "card-accent-success",
  warning: "card-accent-warning",
  destructive: "card-accent-destructive",
  info: "card-accent-info",
};

interface StatCardProps {
  label: string;
  value: number;
  displayValue: string;
  unit?: string;
  usd?: string;
  icon: LucideIcon;
  change: string;
  accent?: AccentColor;
}

export default function StatCard({ label, displayValue, unit, usd, icon: Icon, change, accent = "primary" }: StatCardProps) {
  return (
    <Card
      className={cn("animate-fade-slide-up", accentBorderMap[accent])}
      aria-label={`${label}: ${displayValue}${unit ? ` ${unit}` : ''}`}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-body-sm font-medium text-muted-foreground">{label}</CardTitle>
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", iconBgMap[accent])}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="font-mono-nums text-sats text-foreground">
          {displayValue}
          {unit && <span className="ml-1 text-caption text-muted-foreground">{unit}</span>}
        </div>
        <div className="mt-1 flex items-center gap-2 text-caption">
          {usd && <span className="text-muted-foreground">{usd}</span>}
          <span className="text-success">{change}</span>
        </div>
      </CardContent>
    </Card>
  );
}
