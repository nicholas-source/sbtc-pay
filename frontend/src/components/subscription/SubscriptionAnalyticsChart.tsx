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
import { baseToHuman, formatAmountCompact, tokenLabel } from "@/lib/constants";
import { useSubscriptionStore } from "@/stores/subscription-store";
import type { TokenType } from "@/lib/stacks/config";

type Period = "daily" | "weekly" | "monthly";

import { useLivePrices } from "@/stores/wallet-store";

function buildRealData(
  plans: ReturnType<typeof useSubscriptionStore.getState>["plans"],
  subscribers: ReturnType<typeof useSubscriptionStore.getState>["subscribers"],
  period: Period,
  btcPriceUsd: number,
  stxPriceUsd: number,
) {
  const sbtcUsdRate = btcPriceUsd > 0 ? btcPriceUsd / 100_000_000 : 0; // per sat
  const stxUsdRate = stxPriceUsd > 0 ? stxPriceUsd / 1_000_000 : 0; // per µSTX
  const now = new Date();

  // Build a map from subscriber planId → tokenType
  const planTokenMap = new Map<string, TokenType>();
  for (const plan of plans) {
    planTokenMap.set(plan.id, plan.tokenType ?? 'sbtc');
  }

  // Build time buckets
  const buckets: { label: string; start: Date; end: Date }[] = [];
  if (period === "daily") {
    for (let i = 29; i >= 0; i--) {
      const day = subDays(now, i);
      buckets.push({ label: format(day, "MMM d"), start: startOfDay(day), end: startOfDay(subDays(now, i - 1)) });
    }
  } else if (period === "weekly") {
    for (let i = 11; i >= 0; i--) {
      const week = subWeeks(now, i);
      buckets.push({ label: format(week, "MMM d"), start: startOfWeek(week), end: startOfWeek(subWeeks(now, i - 1)) });
    }
  } else {
    for (let i = 5; i >= 0; i--) {
      const month = subMonths(now, i);
      buckets.push({ label: format(month, "MMM yyyy"), start: startOfMonth(month), end: startOfMonth(subMonths(now, i - 1)) });
    }
  }

  return buckets.map((b) => {
    // Count subscribers active at bucket start (started before bucket end)
    const activeSubs = subscribers.filter((s) => {
      const started = s.startedAt instanceof Date ? s.startedAt : new Date(s.startedAt);
      return !isNaN(started.getTime()) && started <= b.end;
    }).length;

    // Sum payments within this bucket, split by token type
    let sbtcRevenue = 0;
    let stxRevenue = 0;
    for (const sub of subscribers) {
      const tokenType = planTokenMap.get(sub.planId) ?? 'sbtc';
      for (const p of sub.payments) {
        const ts = p.timestamp instanceof Date ? p.timestamp : new Date(p.timestamp);
        if (!isNaN(ts.getTime()) && ts >= b.start && ts < b.end) {
          if (tokenType === 'stx') stxRevenue += p.amount;
          else sbtcRevenue += p.amount;
        }
      }
    }

    const revenueUsd = +(sbtcRevenue * sbtcUsdRate + stxRevenue * stxUsdRate).toFixed(2);

    return {
      date: b.label,
      subscribers: activeSubs,
      sbtcRevenue,
      stxRevenue,
      revenueUsd,
    };
  });
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ dataKey: string; value: number; payload: { revenueUsd: number; sbtcRevenue: number; stxRevenue: number } }>; label?: string }) => {
  if (!active || !payload?.length) return null;
  const subs = payload.find((p) => p.dataKey === "subscribers");
  const data = payload[0]?.payload;
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-lg">
      <p className="text-caption text-muted-foreground mb-1">{label}</p>
      {subs && (
        <p className="font-mono-nums text-sm font-semibold text-foreground">
          {subs.value} <span className="text-muted-foreground">subscribers</span>
        </p>
      )}
      {data && data.sbtcRevenue > 0 && (
        <p className="font-mono-nums text-sm font-semibold text-foreground">
          {baseToHuman(data.sbtcRevenue, 'sbtc').toFixed(8)} <span className="text-muted-foreground">sBTC</span>
        </p>
      )}
      {data && data.stxRevenue > 0 && (
        <p className="font-mono-nums text-sm font-semibold text-foreground">
          {baseToHuman(data.stxRevenue, 'stx').toFixed(2)} <span className="text-muted-foreground">STX</span>
        </p>
      )}
      {data && data.revenueUsd > 0 && (
        <p className="font-mono-nums text-caption text-muted-foreground">
          ≈ ${data.revenueUsd.toLocaleString()}
        </p>
      )}
    </div>
  );
};

export default function SubscriptionAnalyticsChart() {
  const [period, setPeriod] = useState<Period>("daily");
  const isMobile = useIsMobile();
  const { btcPriceUsd, stxPriceUsd } = useLivePrices();
  const plans = useSubscriptionStore((s) => s.plans);
  const subscribers = useSubscriptionStore((s) => s.subscribers);
  const data = useMemo(() => buildRealData(plans, subscribers, period, btcPriceUsd ?? 0, stxPriceUsd ?? 0), [plans, subscribers, period, btcPriceUsd, stxPriceUsd]);
  const hasData = data.some((d) => d.subscribers > 0 || d.revenueUsd > 0);

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
        <div className="h-[220px] sm:h-[280px] md:h-[320px] lg:h-[360px] relative">
          {!hasData && (
            <div className="absolute inset-0 flex items-center justify-center z-10 bg-card/80 rounded-lg">
              <p className="text-muted-foreground text-body-sm">No subscriber data yet. Charts will populate as subscriptions are created.</p>
            </div>
          )}
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
                  tickFormatter={(v) => `$${v}`}
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
                dataKey="revenueUsd"
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
