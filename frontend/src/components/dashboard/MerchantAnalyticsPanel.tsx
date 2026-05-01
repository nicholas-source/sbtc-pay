/**
 * MerchantAnalyticsPanel — per-merchant analytics using store data.
 *
 * Reads from invoice-store (invoice payments) and subscription-store
 * (subscription billing cycle payments), both already hydrated from Supabase
 * by DashboardLayout.  Adapts them to the shared PaymentRow / InvoiceRow
 * shapes so the same pure builder functions are reused.
 *
 * Three tabs:
 *   • Volume      — daily payment counts by token, invoices + subscriptions
 *   • Conversions — invoices created vs paid (subscription-only merchants see
 *                   an empty state here, which is correct — CR is invoice concept)
 *   • Token Mix   — sBTC / STX distribution across all payment types
 */

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { BarChart2 } from "lucide-react";
import {
  BarChart, Bar, ComposedChart, Area, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import {
  buildVolume, buildConversions, buildMix,
  type PaymentRow, type InvoiceRow, type DailyVolume, type DailyConversion,
} from "@/lib/analytics";
import { formatSbtcCompact, formatStxCompact } from "@/lib/constants";
import { useInvoiceStore, type Invoice } from "@/stores/invoice-store";
import { useSubscriptionStore, type Subscriber, type SubscriptionPlan } from "@/stores/subscription-store";

// ── Types ─────────────────────────────────────────────────────────────────────

type TimeRange = "7d" | "30d" | "90d";

const RANGE_DAYS: Record<TimeRange, number> = { "7d": 7, "30d": 30, "90d": 90 };

const PIE_COLORS = ["hsl(var(--primary))", "hsl(var(--secondary))"];

// ── Chart configs ─────────────────────────────────────────────────────────────

const volumeConfig = {
  sbtc: { label: "sBTC", color: "hsl(var(--primary))"   },
  stx:  { label: "STX",  color: "hsl(var(--secondary))" },
} satisfies ChartConfig;

const conversionConfig = {
  paid:  { label: "Paid",   color: "hsl(var(--success))" },
  other: { label: "Other",  color: "hsl(var(--muted-foreground))" },
  rate:  { label: "Rate %", color: "hsl(var(--info))"    },
} satisfies ChartConfig;

// ── Adapters ──────────────────────────────────────────────────────────────────

function toPaymentRows(invoices: Invoice[]): PaymentRow[] {
  return invoices.flatMap((inv) =>
    inv.payments.map((p) => ({
      amount: p.amount,
      fee: null,
      token_type: inv.tokenType ?? "sbtc",
      created_at: p.timestamp instanceof Date
        ? p.timestamp.toISOString()
        : String(p.timestamp),
    })),
  );
}

/**
 * Flatten subscription billing-cycle payments into PaymentRow shape.
 * Plan token type is looked up via the planId → plan map.
 */
function toSubscriptionPaymentRows(
  subscribers: Subscriber[],
  planMap: Map<string, SubscriptionPlan>,
): PaymentRow[] {
  return subscribers.flatMap((sub) => {
    const tokenType = planMap.get(sub.planId)?.tokenType ?? "sbtc";
    return sub.payments.map((p) => ({
      amount: p.amount,
      fee: null,
      token_type: tokenType,
      created_at: p.timestamp instanceof Date
        ? p.timestamp.toISOString()
        : String(p.timestamp),
    }));
  });
}

function toInvoiceRows(invoices: Invoice[]): InvoiceRow[] {
  return invoices.map((inv) => ({
    status: inv.status,
    created_at: inv.createdAt instanceof Date
      ? inv.createdAt.toISOString()
      : String(inv.createdAt),
  }));
}

// ── Sub-components ────────────────────────────────────────────────────────────

const SKELETON_HEIGHTS = [35, 60, 25, 80, 50, 70, 40, 90, 55, 30, 75, 45];

function ChartSkeleton() {
  return (
    <div className="flex h-[260px] w-full items-end gap-1.5 px-4 pb-8" aria-hidden="true">
      {SKELETON_HEIGHTS.map((h, i) => (
        <div key={i} className="flex-1 animate-pulse rounded-sm bg-muted" style={{ height: `${h}%` }} />
      ))}
    </div>
  );
}

function ChartEmpty({ message = "No data in this period" }: { message?: string }) {
  return (
    <div className="flex h-[260px] flex-col items-center justify-center text-muted-foreground">
      <BarChart2 className="mb-3 h-10 w-10 opacity-20" aria-hidden="true" />
      <p className="text-body-sm">{message}</p>
      <p className="text-caption mt-1">Data will appear once transactions occur</p>
    </div>
  );
}

function VolumeTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number; payload: DailyVolume }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const pt       = payload[0].payload;
  const sbtcItem = payload.find((p) => p.dataKey === "sbtc");
  const stxItem  = payload.find((p) => p.dataKey === "stx");
  const total    = (sbtcItem?.value ?? 0) + (stxItem?.value ?? 0);
  return (
    <div className="grid min-w-[9rem] gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <p className="font-medium">{label}</p>
      {(sbtcItem?.value ?? 0) > 0 && (
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: PIE_COLORS[0] }} />
            sBTC
          </span>
          <span className="font-mono-nums font-medium">{sbtcItem!.value}</span>
        </div>
      )}
      {(stxItem?.value ?? 0) > 0 && (
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: PIE_COLORS[1] }} />
            STX
          </span>
          <span className="font-mono-nums font-medium">{stxItem!.value}</span>
        </div>
      )}
      {total > 0 && (
        <div className="flex items-center justify-between gap-4 border-t border-border pt-1">
          <span className="text-muted-foreground">Total</span>
          <span className="font-mono-nums font-medium">{total}</span>
        </div>
      )}
      {(sbtcItem?.value ?? 0) > 0 && (
        <p className="text-muted-foreground">{formatSbtcCompact(pt.sbtcVol)} sBTC vol</p>
      )}
      {(stxItem?.value ?? 0) > 0 && (
        <p className="text-muted-foreground">{formatStxCompact(pt.stxVol)} STX vol</p>
      )}
    </div>
  );
}

function ConversionTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number; payload: DailyConversion }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const pt = payload[0].payload;
  return (
    <div className="grid min-w-[9rem] gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <p className="font-medium">{label}</p>
      <div className="flex items-center justify-between gap-4">
        <span className="text-success">Paid</span>
        <span className="font-mono-nums font-medium">{pt.paid}</span>
      </div>
      {pt.other > 0 && (
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">Other</span>
          <span className="font-mono-nums font-medium">{pt.other}</span>
        </div>
      )}
      <div className="flex items-center justify-between gap-4 border-t border-border pt-1">
        <span className="text-info">Conversion</span>
        <span className="font-mono-nums font-medium text-info">{pt.rate}%</span>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MerchantAnalyticsPanel() {
  const invoices    = useInvoiceStore((s) => s.invoices);
  const isLoading   = useInvoiceStore((s) => s.isLoading);
  const subscribers = useSubscriptionStore((s) => s.subscribers);
  const plans       = useSubscriptionStore((s) => s.plans);
  const [range, setRange] = useState<TimeRange>("30d");
  const days = RANGE_DAYS[range];

  // Stable plan lookup map (planId → plan)
  const planMap = useMemo(() => new Map(plans.map((p) => [p.id, p])), [plans]);

  const cutoff = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d;
  }, [days]);

  const windowInvoices = useMemo(
    () => invoices.filter((inv) => {
      const ts = inv.createdAt instanceof Date ? inv.createdAt : new Date(inv.createdAt);
      return ts >= cutoff;
    }),
    [invoices, cutoff],
  );

  // Subscription payments within the window (keyed by the payment's own timestamp)
  const windowSubPaymentRows = useMemo(() => {
    const allRows = toSubscriptionPaymentRows(subscribers, planMap);
    return allRows.filter((r) => new Date(r.created_at) >= cutoff);
  }, [subscribers, planMap, cutoff]);

  const invoicePaymentRows = useMemo(() => toPaymentRows(windowInvoices), [windowInvoices]);
  // All payment rows: invoices + subscription billings
  const paymentRows  = useMemo(
    () => [...invoicePaymentRows, ...windowSubPaymentRows],
    [invoicePaymentRows, windowSubPaymentRows],
  );
  const invoiceRows  = useMemo(() => toInvoiceRows(windowInvoices),  [windowInvoices]);
  const volume       = useMemo(() => buildVolume(paymentRows, days),       [paymentRows, days]);
  const conversions  = useMemo(() => buildConversions(invoiceRows, days),  [invoiceRows, days]);
  const mix          = useMemo(() => buildMix(paymentRows),                [paymentRows]);

  const hasPayments  = paymentRows.length > 0;
  const hasInvoices  = invoiceRows.length > 0;
  const totalPayments = paymentRows.length;
  const subPaymentCount = windowSubPaymentRows.length;

  // Invoice status breakdown for token-mix tab
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const inv of windowInvoices) {
      counts[inv.status] = (counts[inv.status] ?? 0) + 1;
    }
    return counts;
  }, [windowInvoices]);

  // Overall conversion rate for the whole period
  const overallRate = hasInvoices
    ? Math.round(((statusCounts["paid"] ?? 0) / windowInvoices.length) * 100)
    : 0;

  const pieData = [
    { name: "sBTC", value: mix.sbtcCount },
    { name: "STX",  value: mix.stxCount  },
  ].filter((d) => d.value > 0);

  return (
    <Card className="card-accent-info">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-heading-sm">Analytics</CardTitle>
          <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-0.5">
            {(["7d", "30d", "90d"] as TimeRange[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`rounded-md px-2.5 py-1 text-caption font-medium transition-colors ${
                  range === r
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-2">
        <Tabs defaultValue="volume">
          <TabsList className="mb-4 h-8">
            <TabsTrigger value="volume"      className="text-caption">Volume</TabsTrigger>
            <TabsTrigger value="conversions" className="text-caption">Conversions</TabsTrigger>
            <TabsTrigger value="mix"         className="text-caption">Token Mix</TabsTrigger>
          </TabsList>

          {/* ── Volume ───────────────────────────────────────────────── */}
          <TabsContent value="volume">
            {isLoading ? (
              <ChartSkeleton />
            ) : !hasPayments ? (
              <ChartEmpty message="No payments in this period" />
            ) : (
              <div className="space-y-4">
                <ChartContainer config={volumeConfig} className="h-[260px] w-full">
                  <BarChart data={volume} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      tickLine={false}
                      axisLine={false}
                      interval={days > 30 ? 6 : days > 7 ? 4 : 0}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip content={<VolumeTooltip />} />
                    <Bar dataKey="sbtc" stackId="a" fill="hsl(var(--primary))"   radius={[0, 0, 0, 0]} />
                    <Bar dataKey="stx"  stackId="a" fill="hsl(var(--secondary))" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ChartContainer>

                {/* Period summary */}
                {(() => {
                  const hasSbtc = mix.sbtcVol > 0;
                  const hasStx  = mix.stxVol  > 0;
                  const colClass = hasSbtc && hasStx ? "grid-cols-3" : hasSbtc || hasStx ? "grid-cols-2" : "grid-cols-1";
                  return (
                    <div className={`grid gap-3 border-t border-border pt-4 ${colClass}`}>
                      <div className="text-center">
                        <p className="font-mono-nums text-heading-sm text-foreground">{totalPayments}</p>
                        <p className="text-caption text-muted-foreground">Payments</p>
                      </div>
                      {hasSbtc && (
                        <div className="text-center">
                          <p className="font-mono-nums text-heading-sm text-primary">{formatSbtcCompact(mix.sbtcVol)}</p>
                          <p className="text-caption text-muted-foreground">sBTC Volume</p>
                        </div>
                      )}
                      {hasStx && (
                        <div className="text-center">
                          <p className="font-mono-nums text-heading-sm text-secondary">{formatStxCompact(mix.stxVol)}</p>
                          <p className="text-caption text-muted-foreground">STX Volume</p>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </TabsContent>

          {/* ── Conversions ───────────────────────────────────────────── */}
          <TabsContent value="conversions">
            {isLoading ? (
              <ChartSkeleton />
            ) : !hasInvoices ? (
              <ChartEmpty message="No invoices in this period" />
            ) : (
              <div className="space-y-4">
                <ChartContainer config={conversionConfig} className="h-[260px] w-full">
                  <ComposedChart
                    data={conversions}
                    margin={{ top: 4, right: 44, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      tickLine={false}
                      axisLine={false}
                      interval={days > 30 ? 6 : days > 7 ? 4 : 0}
                    />
                    <YAxis
                      yAxisId="count"
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <YAxis
                      yAxisId="rate"
                      orientation="right"
                      domain={[0, 100]}
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip content={<ConversionTooltip />} />
                    <Area yAxisId="count" dataKey="paid"  stackId="s" fill="hsl(var(--success)/0.25)" stroke="hsl(var(--success))"           strokeWidth={1.5} />
                    <Area yAxisId="count" dataKey="other" stackId="s" fill="hsl(var(--muted-foreground)/0.15)" stroke="hsl(var(--muted-foreground))" strokeWidth={1} />
                    <Line yAxisId="rate"  dataKey="rate"  stroke="hsl(var(--info))" strokeWidth={2} dot={false} strokeDasharray="4 2" />
                  </ComposedChart>
                </ChartContainer>

                {/* Period conversion summary */}
                <div className="grid grid-cols-3 gap-3 border-t border-border pt-4">
                  <div className="text-center">
                    <p className="font-mono-nums text-heading-sm text-foreground">{windowInvoices.length}</p>
                    <p className="text-caption text-muted-foreground">Invoices</p>
                  </div>
                  <div className="text-center">
                    <p className="font-mono-nums text-heading-sm text-success">{statusCounts["paid"] ?? 0}</p>
                    <p className="text-caption text-muted-foreground">Paid</p>
                  </div>
                  <div className="text-center">
                    <p className="font-mono-nums text-heading-sm text-info">{overallRate}%</p>
                    <p className="text-caption text-muted-foreground">Conv. Rate</p>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ── Token Mix ─────────────────────────────────────────────── */}
          <TabsContent value="mix">
            {isLoading ? (
              <ChartSkeleton />
            ) : !hasPayments ? (
              <ChartEmpty message="No payments in this period" />
            ) : (
              <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
                {/* Donut chart */}
                <div className="shrink-0">
                  <ResponsiveContainer width={200} height={200}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={pieData.length > 1 ? 3 : 0}
                        dataKey="value"
                        stroke="none"
                      >
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number, name: string) => [`${value} payments`, name]}
                        contentStyle={{
                          background: "hsl(var(--background))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "0.5rem",
                          fontSize: "0.75rem",
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Stat cards */}
                <div className="flex flex-1 flex-col gap-3 self-center">
                  {mix.sbtcCount > 0 && (
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-body-sm font-medium text-primary">sBTC</span>
                        <span className="text-caption text-muted-foreground">
                          {Math.round((mix.sbtcCount / totalPayments) * 100)}%
                        </span>
                      </div>
                      <p className="font-mono-nums mt-1 text-heading-sm text-foreground">
                        {mix.sbtcCount} <span className="text-caption font-normal text-muted-foreground">payments</span>
                      </p>
                      <p className="font-mono-nums text-caption text-muted-foreground">
                        {formatSbtcCompact(mix.sbtcVol)} volume
                      </p>
                    </div>
                  )}
                  {mix.stxCount > 0 && (
                    <div className="rounded-lg border border-secondary/20 bg-secondary/5 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-body-sm font-medium text-secondary">STX</span>
                        <span className="text-caption text-muted-foreground">
                          {Math.round((mix.stxCount / totalPayments) * 100)}%
                        </span>
                      </div>
                      <p className="font-mono-nums mt-1 text-heading-sm text-foreground">
                        {mix.stxCount} <span className="text-caption font-normal text-muted-foreground">payments</span>
                      </p>
                      <p className="font-mono-nums text-caption text-muted-foreground">
                        {formatStxCompact(mix.stxVol)} volume
                      </p>
                    </div>
                  )}
                  {/* Invoice status breakdown */}
                  {hasInvoices && (
                    <div className="rounded-lg border border-border bg-muted/30 p-3">
                      <p className="mb-2 text-caption font-medium text-muted-foreground">Invoice Status</p>
                      <div className="grid grid-cols-2 gap-1 text-caption">
                        {(["paid","pending","expired","cancelled"] as const).map((s) => {
                          const n = statusCounts[s] ?? 0;
                          if (n === 0) return null;
                          const colorMap: Record<string, string> = {
                            paid: "text-success", pending: "text-primary",
                            expired: "text-warning", cancelled: "text-destructive",
                          };
                          return (
                            <div key={s} className="flex items-center justify-between gap-1">
                              <span className={`capitalize ${colorMap[s]}`}>{s}</span>
                              <span className="font-mono-nums font-medium text-foreground">{n}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {/* Subscription payment source label */}
                  {subPaymentCount > 0 && (
                    <p className="text-center text-caption text-muted-foreground">
                      Includes {subPaymentCount} subscription billing{subPaymentCount !== 1 ? "s" : ""}
                    </p>
                  )}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
