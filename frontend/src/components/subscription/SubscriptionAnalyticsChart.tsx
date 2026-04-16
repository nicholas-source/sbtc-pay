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
import { baseToHuman, formatAmountCompact } from "@/lib/constants";

type Period = "daily" | "weekly" | "monthly";

import { useBtcPrice } from "@/stores/wallet-store";

function seed(i: number) {
  const x = Math.sin(i * 131.7 + 217.3) * 41283.1927;
  return x - Math.floor(x);
}

function generateData(period: Period, btcPriceUsd: number) {
  const usdRate = btcPriceUsd / 100_000_000;
  const now = new Date();

  if (period === "daily") {
    return Array.from({ length: 30 }, (_, i) => {
      const date = subDays(now, 29 - i);
      const subscribers = Math.round(8 + (i / 29) * 12 + seed(i) * 4);
      const revenue = Math.round(20000 + (i / 29) * 40000 + seed(i + 200) * 15000);
      return { date: format(date, "MMM d"), subscribers, revenue, revenueUsd: +(revenue * usdRate).toFixed(2) };
    });
  }
  if (period === "weekly") {
    return Array.from({ length: 12 }, (_, i) => {
      const date = subWeeks(now, 11 - i);
      const subscribers = Math.round(5 + (i / 11) * 18 + seed(i + 50) * 5);
      const revenue = Math.round(80000 + (i / 11) * 200000 + seed(i + 250) * 60000);
      return { date: format(date, "MMM d"), subscribers, revenue, revenueUsd: +(revenue * usdRate).toFixed(2) };
    });
  }
  return Array.from({ length: 6 }, (_, i) => {
    const date = subMonths(now, 5 - i);
    const subscribers = Math.round(3 + (i / 5) * 20 + seed(i + 100) * 6);
    const revenue = Math.round(300000 + (i / 5) * 800000 + seed(i + 300) * 200000);
    return { date: format(date, "MMM yyyy"), subscribers, revenue, revenueUsd: +(revenue * usdRate).toFixed(2) };
  });
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ dataKey: string; value: number; payload: { revenueUsd: number } }>; label?: string }) => {
  if (!active || !payload?.length) return null;
  const subs = payload.find((p) => p.dataKey === "subscribers");
  const rev = payload.find((p) => p.dataKey === "revenue");
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-lg">
      <p className="text-caption text-muted-foreground mb-1">{label}</p>
      {subs && (
        <p className="font-mono-nums text-sm font-semibold text-foreground">
          {subs.value} <span className="text-muted-foreground">subscribers</span>
        </p>
      )}
      {rev && (
        <>
          <p className="font-mono-nums text-sm font-semibold text-foreground">
            {baseToHuman(rev.value, 'sbtc').toFixed(8)} <span className="text-muted-foreground">sBTC</span>
          </p>
          <p className="font-mono-nums text-caption text-muted-foreground">
            ≈ ${rev.payload.revenueUsd.toLocaleString()}
          </p>
        </>
      )}
    </div>
  );
};

export default function SubscriptionAnalyticsChart() {
  const [period, setPeriod] = useState<Period>("daily");
  const isMobile = useIsMobile();
  const btcPrice = useBtcPrice();
  const data = useMemo(() => generateData(period, btcPrice), [period, btcPrice]);

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-4">
          <CardTitle className="text-heading-sm">Subscription Analytics</CardTitle>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-chart-1" />
              Subscribers
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-chart-3" />
              Revenue
            </span>
          </div>
        </div>
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
        <div className="h-[220px] sm:h-[280px] md:h-[320px] lg:h-[360px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: isMobile ? 4 : 8, left: isMobile ? -20 : 0, bottom: 0 }}>
              <defs>
                <linearGradient id="subAnalyticsSubsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="subAnalyticsRevGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--chart-2))" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
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
              <YAxis
                yAxisId="left"
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                hide={isMobile}
              />
              {!isMobile && (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => formatAmountCompact(v, 'sbtc')}
                />
              )}
              <Tooltip content={<CustomTooltip />} />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="subscribers"
                stroke="hsl(var(--chart-1))"
                strokeWidth={2}
                fill="url(#subAnalyticsSubsGrad)"
                animationDuration={800}
              />
              <Area
                yAxisId={isMobile ? "left" : "right"}
                type="monotone"
                dataKey="revenue"
                stroke="hsl(var(--chart-2))"
                strokeWidth={2}
                fill="url(#subAnalyticsRevGrad)"
                animationDuration={800}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
