import { useState, useMemo, useEffect } from "react";
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
import { amountToUsd } from "@/lib/constants";
import { useInvoiceStore, type Invoice } from "@/stores/invoice-store";
import { useSubscriptionStore, type SubscriptionPlan, type Subscriber } from "@/stores/subscription-store";
import { useLivePrices, useWalletStore } from "@/stores/wallet-store";
import { supabaseWithWallet } from "@/lib/supabase/client";

type Period = "daily" | "weekly" | "monthly";

interface DirectPaymentRow {
  amount: number;
  token_type: string | null;
  created_at: string;
}

function buildRevenueData(
  invoices: Invoice[],
  plans: SubscriptionPlan[],
  subscribers: Subscriber[],
  directPayments: DirectPaymentRow[],
  period: Period,
  btcPriceUsd: number | null,
  stxPriceUsd: number | null,
) {
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

  // Sum paid amounts into buckets (converted to USD to avoid mixing sats and microSTX)
  const usdMap = new Map<string, number>();
  buckets.forEach((b) => usdMap.set(b.key, 0));

  // Build a lookup of invoice tokenType by invoice id
  const tokenByInvoice = new Map<string, 'sbtc' | 'stx'>();
  for (const inv of invoices) tokenByInvoice.set(inv.id, inv.tokenType ?? 'sbtc');

  for (const inv of invoices) {
    const tt = inv.tokenType ?? 'sbtc';
    for (const p of inv.payments) {
      if (p.amount <= 0) continue;
      const d = new Date(p.timestamp);
      let key: string;
      if (period === "daily") key = format(d, "yyyy-MM-dd");
      else if (period === "weekly") key = format(startOfWeek(d), "yyyy-MM-dd");
      else key = format(d, "yyyy-MM");
      if (usdMap.has(key)) {
        usdMap.set(key, usdMap.get(key)! + (parseFloat(amountToUsd(p.amount, tt, btcPriceUsd, stxPriceUsd)) || 0));
      }
    }
  }

  // Sum subscription payments into buckets
  const planTokenMap = new Map<string, 'sbtc' | 'stx'>();
  for (const plan of plans) planTokenMap.set(plan.id, plan.tokenType ?? 'sbtc');

  for (const sub of subscribers) {
    const tt = planTokenMap.get(sub.planId) ?? 'sbtc';
    for (const p of sub.payments) {
      if (p.amount <= 0) continue;
      const d = new Date(p.timestamp);
      let key: string;
      if (period === "daily") key = format(d, "yyyy-MM-dd");
      else if (period === "weekly") key = format(startOfWeek(d), "yyyy-MM-dd");
      else key = format(d, "yyyy-MM");
      if (usdMap.has(key)) {
        usdMap.set(key, usdMap.get(key)! + (parseFloat(amountToUsd(p.amount, tt, btcPriceUsd, stxPriceUsd)) || 0));
      }
    }
  }

  // Sum direct payments into the same buckets
  for (const dp of directPayments) {
    if (!dp.amount || dp.amount <= 0) continue;
    const tt: 'sbtc' | 'stx' = dp.token_type === 'stx' ? 'stx' : 'sbtc';
    const d = new Date(dp.created_at);
    let key: string;
    if (period === "daily") key = format(d, "yyyy-MM-dd");
    else if (period === "weekly") key = format(startOfWeek(d), "yyyy-MM-dd");
    else key = format(d, "yyyy-MM");
    if (usdMap.has(key)) {
      usdMap.set(key, usdMap.get(key)! + (parseFloat(amountToUsd(dp.amount, tt, btcPriceUsd, stxPriceUsd)) || 0));
    }
  }

  return buckets.map((b) => {
    const usd = usdMap.get(b.key) || 0;
    return { date: b.label, usd };
  });
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-lg">
      <p className="text-caption text-muted-foreground mb-1">{label}</p>
      <p className="font-mono-nums text-sm font-semibold text-foreground">
        ${payload[0].value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-muted-foreground">USD</span>
      </p>
    </div>
  );
};

export default function RevenueChart() {
  const [period, setPeriod] = useState<Period>("daily");
  const isMobile = useIsMobile();
  const invoices = useInvoiceStore((s) => s.invoices);
  const plans = useSubscriptionStore((s) => s.plans);
  const subscribers = useSubscriptionStore((s) => s.subscribers);
  const { btcPriceUsd, stxPriceUsd } = useLivePrices();
  const { address, isAuthenticated } = useWalletStore();

  // Direct payments: fetched here because they aren't in any Zustand store.
  // Window: last 6 months to cover all chart periods (daily/weekly/monthly
  // currently span 30 days / 12 weeks / 6 months).
  const [directPayments, setDirectPayments] = useState<DirectPaymentRow[]>([]);

  useEffect(() => {
    if (!address || !isAuthenticated) {
      setDirectPayments([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const since = subMonths(new Date(), 6).toISOString();
      const db = supabaseWithWallet(address);
      const { data, error } = await db
        .from("direct_payments")
        .select("amount, token_type, created_at")
        .eq("merchant_principal", address)
        .gte("created_at", since);
      if (cancelled || error || !data) return;
      setDirectPayments(data as DirectPaymentRow[]);
    })();
    return () => { cancelled = true; };
  }, [address, isAuthenticated]);

  const data = useMemo(
    () => buildRevenueData(invoices, plans, subscribers, directPayments, period, btcPriceUsd, stxPriceUsd),
    [invoices, plans, subscribers, directPayments, period, btcPriceUsd, stxPriceUsd],
  );
  const hasRevenue = data.some((d) => d.usd > 0);

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
        <div className="h-[220px] sm:h-[280px] md:h-[320px] lg:h-[360px]">
          {!hasRevenue ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              No revenue yet. Create invoices and receive payments to see your chart.
            </div>
          ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 4, left: isMobile ? -20 : 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.4} />
                  <stop offset="50%" stopColor="hsl(var(--chart-2))" stopOpacity={0.15} />
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
              {!isMobile && (
                <YAxis
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toFixed(0)}`}
                />
              )}
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="usd"
                stroke="hsl(var(--chart-1))"
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
