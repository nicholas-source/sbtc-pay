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
import { format, subDays, subWeeks, subMonths, startOfDay, startOfWeek, startOfMonth } from "date-fns";
import { useIsMobile } from "@/hooks/use-mobile";
import { satsToSbtc, formatSbtcCompact, BTC_USD } from "@/lib/constants";
import { useInvoiceStore, type Invoice } from "@/stores/invoice-store";

type Period = "daily" | "weekly" | "monthly";

function buildRevenueData(invoices: Invoice[], period: Period) {
  const now = new Date();

  // Build time buckets
  const buckets: { key: string; label: string; start: Date }[] = [];
  if (period === "daily") {
    for (let i = 29; i >= 0; i--) {
      const d = subDays(now, i);
      buckets.push({ key: format(d, "yyyy-MM-dd"), label: format(d, "MMM d"), start: startOfDay(d) });
    }
  } else if (period === "weekly") {
    for (let i = 11; i >= 0; i--) {
      const d = subWeeks(now, i);
      buckets.push({ key: format(startOfWeek(d), "yyyy-MM-dd"), label: format(d, "MMM d"), start: startOfWeek(d) });
    }
  } else {
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(now, i);
      buckets.push({ key: format(d, "yyyy-MM"), label: format(d, "MMM yyyy"), start: startOfMonth(d) });
    }
  }

  // Sum paid amounts into buckets using payment dates
  const satsMap = new Map<string, number>();
  buckets.forEach((b) => satsMap.set(b.key, 0));

  for (const inv of invoices) {
    for (const p of inv.payments) {
      if (p.amount <= 0) continue;
      const d = new Date(p.timestamp);
      let key: string;
      if (period === "daily") key = format(d, "yyyy-MM-dd");
      else if (period === "weekly") key = format(startOfWeek(d), "yyyy-MM-dd");
      else key = format(d, "yyyy-MM");
      if (satsMap.has(key)) {
        satsMap.set(key, satsMap.get(key)! + p.amount);
      }
    }
  }

  return buckets.map((b) => {
    const sats = satsMap.get(b.key) || 0;
    return { date: b.label, sats, usd: +(sats * BTC_USD).toFixed(2) };
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
  const invoices = useInvoiceStore((s) => s.invoices);
  const data = useMemo(() => buildRevenueData(invoices, period), [invoices, period]);
  const hasRevenue = data.some((d) => d.sats > 0);

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
          {!hasRevenue ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              No revenue yet. Create invoices and receive payments to see your chart.
            </div>
          ) : (
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
          )}
        </div>
      </CardContent>
    </Card>
  );
}
