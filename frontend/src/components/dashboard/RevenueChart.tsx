import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format, subDays, subWeeks, subMonths } from "date-fns";
import { useIsMobile } from "@/hooks/use-mobile";
import { satsToSbtc, formatSbtcCompact } from "@/lib/constants";

type Period = "daily" | "weekly" | "monthly";

function generateData(period: Period) {
  const now = new Date();
  const seed = (i: number) => {
    const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };

  if (period === "daily") {
    return Array.from({ length: 30 }, (_, i) => {
      const date = subDays(now, 29 - i);
      const sats = Math.round(50000 + seed(i) * 150000);
      return { date: format(date, "MMM d"), sats, usd: +(sats * 0.000975).toFixed(2) };
    });
  }
  if (period === "weekly") {
    return Array.from({ length: 12 }, (_, i) => {
      const date = subWeeks(now, 11 - i);
      const sats = Math.round(300000 + seed(i + 50) * 700000);
      return { date: format(date, "MMM d"), sats, usd: +(sats * 0.000975).toFixed(2) };
    });
  }
  return Array.from({ length: 6 }, (_, i) => {
    const date = subMonths(now, 5 - i);
    const sats = Math.round(1200000 + seed(i + 100) * 3000000);
    return { date: format(date, "MMM yyyy"), sats, usd: +(sats * 0.000975).toFixed(2) };
  });
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; payload: { usd: number } }>; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-lg">
      <p className="text-caption text-muted-foreground mb-1">{label}</p>
      <p className="font-mono-nums text-sm font-semibold text-foreground">
        {satsToSbtc(payload[0].value).toFixed(8)} <span className="text-muted-foreground">sBTC</span>
      </p>
      <p className="font-mono-nums text-caption text-muted-foreground">
        ${payload[0].payload.usd.toLocaleString()}
      </p>
    </div>
  );
};

export default function RevenueChart() {
  const [period, setPeriod] = useState<Period>("daily");
  const isMobile = useIsMobile();
  const data = useMemo(() => generateData(period), [period]);

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <CardTitle className="text-heading-sm">Revenue</CardTitle>
        <ToggleGroup
          type="single"
          value={period}
          onValueChange={(v) => v && setPeriod(v as Period)}
          variant="outline"
          size="sm"
        >
          <ToggleGroupItem value="daily" className="text-xs px-3">Daily</ToggleGroupItem>
          <ToggleGroupItem value="weekly" className="text-xs px-3">Weekly</ToggleGroupItem>
          <ToggleGroupItem value="monthly" className="text-xs px-3">Monthly</ToggleGroupItem>
        </ToggleGroup>
      </CardHeader>
      <CardContent>
        <div className="h-[280px] sm:h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 4, left: isMobile ? -20 : 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(27, 98%, 54%)" stopOpacity={0.4} />
                  <stop offset="50%" stopColor="hsl(263, 70%, 58%)" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="hsl(263, 70%, 58%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                interval={isMobile ? "preserveStartEnd" : undefined}
              />
              {!isMobile && (
                <YAxis
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => formatSbtcCompact(v)}
                />
              )}
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="sats"
                stroke="hsl(27, 98%, 54%)"
                strokeWidth={2}
                fill="url(#revenueGradient)"
                animationDuration={800}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
