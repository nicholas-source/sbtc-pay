import { useState, useEffect, useCallback, useRef } from "react";
import { format, subDays } from "date-fns";
import { AlertTriangle, BarChart2, RefreshCw } from "lucide-react";
import {
  BarChart, Bar, ComposedChart, Area, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { supabase } from "@/lib/supabase/client";
import {
  buildVolume, buildConversions, buildMix,
  type PaymentRow, type InvoiceRow,
  type DailyVolume, type DailyConversion, type TokenMix,
} from "@/lib/analytics";
import { formatSbtcCompact, formatStxCompact } from "@/lib/constants";
import { STATUS_MAP } from "@/stores/invoice-store";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────
// DailyVolume, DailyConversion, TokenMix, PaymentRow, InvoiceRow re-exported
// from @/lib/analytics; only panel-specific types defined here.

type TimeRange = "7d" | "30d" | "90d";

interface Analytics {
  volume: DailyVolume[];
  conversions: DailyConversion[];
  mix: TokenMix;
  truncated: boolean; // true if either query hit the row limit
}

// ── Constants ─────────────────────────────────────────────────────────────────

const RANGE_DAYS: Record<TimeRange, number> = { "7d": 7, "30d": 30, "90d": 90 };
// Generous limit — signals clearly if exceeded rather than silently truncating
const QUERY_LIMIT = 5000;

const SKELETON_HEIGHTS = [35, 60, 25, 80, 50, 70, 40, 90, 55, 30, 75, 45];

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

// ── Sub-components ────────────────────────────────────────────────────────────

function ChartSkeleton() {
  return (
    <div
      className="flex h-[280px] w-full items-end gap-1.5 px-4 pb-8"
      aria-hidden="true"
    >
      {SKELETON_HEIGHTS.map((h, i) => (
        <div
          key={i}
          className="flex-1 animate-pulse rounded-sm bg-muted"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}

function ChartEmpty({ message = "No data in this period" }: { message?: string }) {
  return (
    <div className="flex h-[280px] flex-col items-center justify-center text-muted-foreground">
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
        <div className="grid gap-0.5">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: PIE_COLORS[0] }} />
            <span className="text-muted-foreground">sBTC</span>
            <span className="ml-auto font-mono font-medium tabular-nums">
              {sbtcItem!.value} txn{sbtcItem!.value !== 1 ? "s" : ""}
            </span>
          </div>
          {pt.sbtcVol > 0 && (
            <p className="pl-4 font-mono text-muted-foreground">{formatSbtcCompact(pt.sbtcVol)} sBTC</p>
          )}
        </div>
      )}
      {(stxItem?.value ?? 0) > 0 && (
        <div className="grid gap-0.5">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: PIE_COLORS[1] }} />
            <span className="text-muted-foreground">STX</span>
            <span className="ml-auto font-mono font-medium tabular-nums">
              {stxItem!.value} txn{stxItem!.value !== 1 ? "s" : ""}
            </span>
          </div>
          {pt.stxVol > 0 && (
            <p className="pl-4 font-mono text-muted-foreground">{formatStxCompact(pt.stxVol)} STX</p>
          )}
        </div>
      )}
      {total === 0 && <p className="text-muted-foreground">No payments</p>}
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
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-[2px] bg-success" />
        <span className="text-muted-foreground">Paid</span>
        <span className="ml-auto font-mono font-medium tabular-nums">{pt.paid}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-[2px] bg-muted-foreground" />
        <span className="text-muted-foreground">Other</span>
        <span className="ml-auto font-mono font-medium tabular-nums">{pt.other}</span>
      </div>
      {pt.total > 0 && (
        <div className="flex items-center gap-2 mt-0.5 border-t border-border pt-1">
          <span className="text-muted-foreground">Conv. rate</span>
          <span className="ml-auto font-mono font-medium tabular-nums text-info">{pt.rate}%</span>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function PlatformAnalyticsPanel() {
  const [timeRange, setTimeRange] = useState<TimeRange>("30d");
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  // Abort controller ref — cancels stale in-flight fetches on rapid range changes
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    // Cancel any previous in-flight fetch
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const days  = RANGE_DAYS[timeRange];
      const since = subDays(new Date(), days - 1).toISOString();

      const [paymentsRes, invoicesRes] = await Promise.all([
        supabase
          .from("payments")
          .select("amount, fee, token_type, created_at")
          .gte("created_at", since)
          .limit(QUERY_LIMIT),
        supabase
          .from("invoices")
          .select("status, created_at")
          .gte("created_at", since)
          .limit(QUERY_LIMIT),
      ]);

      // Ignore result if this request was superseded
      if (controller.signal.aborted) return;

      if (paymentsRes.error) throw paymentsRes.error;
      if (invoicesRes.error) throw invoicesRes.error;

      const payments: PaymentRow[] = paymentsRes.data ?? [];
      // Supabase stores status as a numeric contract code; map to string label
      const invoices: InvoiceRow[] = (invoicesRes.data ?? []).map((r) => ({
        status: STATUS_MAP[r.status] ?? "pending",
        created_at: r.created_at,
      }));
      const truncated =
        payments.length === QUERY_LIMIT || invoices.length === QUERY_LIMIT;

      setAnalytics({
        volume:      buildVolume(payments, days),
        conversions: buildConversions(invoices, days),
        mix:         buildMix(payments),
        truncated,
      });
    } catch {
      if (!controller.signal.aborted) {
        setError("Failed to load analytics. Please try again.");
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [timeRange]);

  useEffect(() => {
    load();
    return () => { abortRef.current?.abort(); };
  }, [load]);

  // Derived summary values
  const totalPayments = analytics ? analytics.mix.sbtcCount + analytics.mix.stxCount : 0;
  const totalInvoices = analytics ? analytics.conversions.reduce((s, d) => s + d.total, 0) : 0;
  const totalPaid     = analytics ? analytics.conversions.reduce((s, d) => s + d.paid, 0) : 0;
  const overallRate   = totalInvoices > 0 ? Math.round((totalPaid / totalInvoices) * 100) : null;
  const hasVolume     = totalPayments > 0;
  const hasInvoices   = totalInvoices > 0;

  // X-axis tick interval based on data density
  const xInterval = !analytics
    ? 0
    : analytics.volume.length <= 7 ? 0
    : analytics.volume.length <= 30 ? 4
    : 13;

  const pieData = analytics
    ? [
        { name: "sBTC", value: analytics.mix.sbtcCount },
        { name: "STX",  value: analytics.mix.stxCount  },
      ]
    : [];

  return (
    <Card className="card-accent-info">
      <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
        <div>
          <CardTitle className="text-heading-sm flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-info" /> Platform Analytics
          </CardTitle>
          <p className="text-body-sm text-muted-foreground mt-1">
            Payment volume, invoice conversions &amp; token distribution
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1" role="group" aria-label="Select time range">
            {(["7d", "30d", "90d"] as TimeRange[]).map((r) => (
              <Button
                key={r}
                variant={timeRange === r ? "default" : "outline"}
                size="sm"
                onClick={() => setTimeRange(r)}
                aria-pressed={timeRange === r}
              >
                {r}
              </Button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={loading}
            aria-label="Refresh analytics"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-body-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {analytics?.truncated && !error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-body-sm text-warning">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Volume is very high — charts show the first {QUERY_LIMIT.toLocaleString()} records. Totals may be understated.
          </div>
        )}

        <Tabs defaultValue="volume">
          <TabsList className="mb-6">
            <TabsTrigger value="volume">Volume</TabsTrigger>
            <TabsTrigger value="conversions">Conversions</TabsTrigger>
            <TabsTrigger value="token-mix">Token Mix</TabsTrigger>
          </TabsList>

          {/* ── Volume ──────────────────────────────────────────────── */}
          <TabsContent value="volume">
            {loading ? (
              <ChartSkeleton />
            ) : !hasVolume ? (
              <ChartEmpty />
            ) : (
              <div className="space-y-4">
                <ChartContainer config={volumeConfig} className="h-[280px] w-full">
                  <BarChart
                    data={analytics!.volume}
                    margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      interval={xInterval}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      tick={{ fontSize: 11 }}
                      width={28}
                    />
                    <Tooltip
                      content={<VolumeTooltip />}
                      cursor={{ fill: "hsl(var(--muted))" }}
                    />
                    <Bar dataKey="sbtc" stackId="a" fill="var(--color-sbtc)" />
                    <Bar dataKey="stx"  stackId="a" fill="var(--color-stx)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>

                {/* Legend */}
                <div className="flex items-center justify-center gap-6 text-caption text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: PIE_COLORS[0] }} />
                    sBTC payments
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: PIE_COLORS[1] }} />
                    STX payments
                  </span>
                </div>

                {/* Period summary — columns flex to actual token presence */}
                {(() => {
                  const hasSbtc = analytics!.mix.sbtcVol > 0;
                  const hasStx  = analytics!.mix.stxVol > 0;
                  const colClass = hasSbtc && hasStx ? "grid-cols-3" : hasSbtc || hasStx ? "grid-cols-2" : "grid-cols-1";
                  return (
                    <div className={`grid gap-3 border-t border-border pt-4 ${colClass}`}>
                      <div className="text-center">
                        <p className="font-mono-nums text-heading-sm text-foreground">{totalPayments}</p>
                        <p className="text-caption text-muted-foreground">Total Payments</p>
                      </div>
                      {hasSbtc && (
                        <div className="text-center">
                          <p className="font-mono-nums text-heading-sm text-primary">{formatSbtcCompact(analytics!.mix.sbtcVol)}</p>
                          <p className="text-caption text-muted-foreground">sBTC Volume</p>
                        </div>
                      )}
                      {hasStx && (
                        <div className="text-center">
                          <p className="font-mono-nums text-heading-sm text-secondary">{formatStxCompact(analytics!.mix.stxVol)}</p>
                          <p className="text-caption text-muted-foreground">STX Volume</p>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </TabsContent>

          {/* ── Conversions ─────────────────────────────────────────── */}
          <TabsContent value="conversions">
            {loading ? (
              <ChartSkeleton />
            ) : !hasInvoices ? (
              <ChartEmpty message="No invoices in this period" />
            ) : (
              <div className="space-y-4">
                <ChartContainer config={conversionConfig} className="h-[280px] w-full">
                  <ComposedChart
                    data={analytics!.conversions}
                    margin={{ top: 4, right: 44, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      interval={xInterval}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis
                      yAxisId="count"
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      tick={{ fontSize: 11 }}
                      width={28}
                    />
                    <YAxis
                      yAxisId="rate"
                      orientation="right"
                      tickLine={false}
                      axisLine={false}
                      domain={[0, 100]}
                      tickFormatter={(v) => `${v}%`}
                      tick={{ fontSize: 11 }}
                      width={36}
                    />
                    <Tooltip
                      content={<ConversionTooltip />}
                      cursor={{ fill: "hsl(var(--muted))" }}
                    />
                    {/* Paid invoices — green fill */}
                    <Area
                      yAxisId="count"
                      type="monotone"
                      dataKey="paid"
                      stackId="1"
                      stroke="var(--color-paid)"
                      fill="var(--color-paid)"
                      fillOpacity={0.35}
                      strokeWidth={1.5}
                    />
                    {/* Unconverted — muted fill above paid */}
                    <Area
                      yAxisId="count"
                      type="monotone"
                      dataKey="other"
                      stackId="1"
                      stroke="hsl(var(--muted-foreground))"
                      fill="hsl(var(--muted-foreground))"
                      fillOpacity={0.12}
                      strokeWidth={1}
                    />
                    {/* Conversion rate % — dashed info line on right axis */}
                    <Line
                      yAxisId="rate"
                      type="monotone"
                      dataKey="rate"
                      stroke="var(--color-rate)"
                      strokeWidth={2}
                      dot={false}
                      strokeDasharray="5 3"
                    />
                  </ComposedChart>
                </ChartContainer>

                {/* Legend */}
                <div className="flex flex-wrap items-center justify-center gap-6 text-caption text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-success" />
                    Paid invoices
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-muted-foreground opacity-40" />
                    Pending / expired
                  </span>
                  <span className="flex items-center gap-1.5">
                    <svg width="20" height="4" viewBox="0 0 20 4" aria-hidden="true">
                      <line
                        x1="0" y1="2" x2="20" y2="2"
                        stroke="hsl(var(--info))"
                        strokeWidth="2"
                        strokeDasharray="5 3"
                      />
                    </svg>
                    Conv. rate %
                  </span>
                </div>

                {/* Period summary */}
                <div className="grid grid-cols-3 gap-3 border-t border-border pt-4">
                  <div className="text-center">
                    <p className="font-mono-nums text-heading-sm text-foreground">{totalInvoices}</p>
                    <p className="text-caption text-muted-foreground">Total Invoices</p>
                  </div>
                  <div className="text-center">
                    <p className="font-mono-nums text-heading-sm text-success">{totalPaid}</p>
                    <p className="text-caption text-muted-foreground">Paid</p>
                  </div>
                  <div className="text-center">
                    <p className={cn(
                      "font-mono-nums text-heading-sm",
                      overallRate === null  ? "text-muted-foreground"
                      : overallRate >= 70   ? "text-success"
                      : overallRate >= 40   ? "text-warning"
                      : "text-destructive",
                    )}>
                      {overallRate !== null ? `${overallRate}%` : "—"}
                    </p>
                    <p className="text-caption text-muted-foreground">Conv. Rate</p>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ── Token Mix ───────────────────────────────────────────── */}
          <TabsContent value="token-mix">
            {loading ? (
              <div className="flex h-[280px] items-center justify-center" aria-hidden="true">
                <div className="h-40 w-40 animate-pulse rounded-full bg-muted" />
              </div>
            ) : totalPayments === 0 ? (
              <ChartEmpty />
            ) : (
              <div className="flex flex-col sm:flex-row items-center gap-8">
                {/* Donut chart */}
                <div className="h-[220px] w-[220px] shrink-0" role="img" aria-label="Token distribution donut chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={96}
                        paddingAngle={pieData[0].value > 0 && pieData[1].value > 0 ? 4 : 0}
                        dataKey="value"
                        startAngle={90}
                        endAngle={-270}
                      >
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i]} strokeWidth={0} />
                        ))}
                      </Pie>
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const item  = payload[0];
                          const total = pieData.reduce((s, d) => s + d.value, 0);
                          const pct   = total > 0
                            ? Math.round(((item.value as number) / total) * 100)
                            : 0;
                          return (
                            <div className="rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                              <p className="font-medium">{item.name}</p>
                              <p className="font-mono text-muted-foreground">
                                {item.value as number} payment{(item.value as number) !== 1 ? "s" : ""} ({pct}%)
                              </p>
                            </div>
                          );
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Per-token breakdown */}
                <div className="flex-1 w-full space-y-3">
                  {/* sBTC */}
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-body-sm font-medium text-primary">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[0] }} />
                        sBTC
                      </span>
                      <span className="text-caption text-muted-foreground">
                        {analytics!.mix.sbtcCount > 0 && analytics!.mix.stxCount > 0
                          ? `${Math.round((analytics!.mix.sbtcCount / totalPayments) * 100)}% of payments`
                          : `${analytics!.mix.sbtcCount} payment${analytics!.mix.sbtcCount !== 1 ? "s" : ""}`}
                      </span>
                    </div>
                    <p className="font-mono-nums text-heading-sm text-foreground">
                      {formatSbtcCompact(analytics!.mix.sbtcVol)}{" "}
                      <span className="text-caption text-muted-foreground font-normal">sBTC volume</span>
                    </p>
                    {analytics!.mix.sbtcFees > 0 && (
                      <p className="text-caption text-warning">
                        Fees collected: {formatSbtcCompact(analytics!.mix.sbtcFees)} sBTC
                      </p>
                    )}
                  </div>

                  {/* STX */}
                  <div className="rounded-lg border border-secondary/20 bg-secondary/5 p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-body-sm font-medium text-secondary">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[1] }} />
                        STX
                      </span>
                      <span className="text-caption text-muted-foreground">
                        {analytics!.mix.sbtcCount > 0 && analytics!.mix.stxCount > 0
                          ? `${Math.round((analytics!.mix.stxCount / totalPayments) * 100)}% of payments`
                          : `${analytics!.mix.stxCount} payment${analytics!.mix.stxCount !== 1 ? "s" : ""}`}
                      </span>
                    </div>
                    <p className="font-mono-nums text-heading-sm text-foreground">
                      {formatStxCompact(analytics!.mix.stxVol)}{" "}
                      <span className="text-caption text-muted-foreground font-normal">STX volume</span>
                    </p>
                    {analytics!.mix.stxFees > 0 && (
                      <p className="text-caption text-warning">
                        Fees collected: {formatStxCompact(analytics!.mix.stxFees)} STX
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
