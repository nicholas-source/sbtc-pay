import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { TrendingUp, FileText, Repeat, RefreshCcw, FilePlus, Code2, ArrowRight } from "lucide-react";
import { useMerchantStore } from "@/stores/merchant-store";
import { useInvoiceStore } from "@/stores/invoice-store";
import { useSubscriptionStore } from "@/stores/subscription-store";
import { useWalletStore } from "@/stores/wallet-store";
import { supabaseWithWallet } from "@/lib/supabase/client";
import MerchantRegistration from "@/components/dashboard/MerchantRegistration";
import StatCard from "@/components/dashboard/StatCard";
import RevenueChart from "@/components/dashboard/RevenueChart";
import ActivityFeed from "@/components/dashboard/ActivityFeed";
import { MerchantAnalyticsPanel } from "@/components/dashboard/MerchantAnalyticsPanel";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { amountToUsd, formatAmount } from "@/lib/constants";
import { useLivePrices } from "@/stores/wallet-store";
import { PriceStatusBadge } from "@/components/pay/PriceStatusBadge";

function DashboardOverview() {
  const profile = useMerchantStore((s) => s.profile);
  const invoices = useInvoiceStore((s) => s.invoices);
  const subscribers = useSubscriptionStore((s) => s.subscribers);
  const { btcPriceUsd, stxPriceUsd } = useLivePrices();
  const { address, isAuthenticated } = useWalletStore();

  // Direct payment totals — invoice store doesn't carry them, so fetch
  // aggregates directly. Keep state lifted to this component so they can be
  // folded into the Total Revenue stat alongside invoice payments.
  const [directSbtc, setDirectSbtc] = useState(0);
  const [directStx, setDirectStx] = useState(0);

  useEffect(() => {
    if (!address || !isAuthenticated) {
      setDirectSbtc(0);
      setDirectStx(0);
      return;
    }
    let cancelled = false;
    (async () => {
      const db = supabaseWithWallet(address);
      const { data, error } = await db
        .from("direct_payments")
        .select("merchant_received, token_type")
        .eq("merchant_principal", address);
      if (cancelled || error || !data) return;
      let sbtc = 0;
      let stx = 0;
      for (const r of data) {
        const amt = r.merchant_received ?? 0;
        if (r.token_type === "stx") stx += amt;
        else sbtc += amt;
      }
      setDirectSbtc(sbtc);
      setDirectStx(stx);
    })();
    return () => { cancelled = true; };
  }, [address, isAuthenticated]);

  if (!profile) {
    return <MerchantRegistration />;
  }

  // Split revenue & refunds by token type to avoid mixing sats and microSTX
  const sbtcInvoices = invoices.filter((inv) => inv.tokenType !== 'stx');
  const stxInvoices = invoices.filter((inv) => inv.tokenType === 'stx');

  const sbtcRevenue = sbtcInvoices.reduce((sum, inv) => sum + inv.amountPaid, 0) + directSbtc;
  const stxRevenue = stxInvoices.reduce((sum, inv) => sum + inv.amountPaid, 0) + directStx;
  const totalRevenueUsd = (sbtcRevenue > 0 ? parseFloat(amountToUsd(sbtcRevenue, 'sbtc', btcPriceUsd, stxPriceUsd)) || 0 : 0)
    + (stxRevenue > 0 ? parseFloat(amountToUsd(stxRevenue, 'stx', btcPriceUsd, stxPriceUsd)) || 0 : 0);

  const sbtcRefunds = sbtcInvoices.reduce((sum, inv) => sum + inv.refunds.reduce((s, r) => s + r.amount, 0), 0);
  const stxRefunds = stxInvoices.reduce((sum, inv) => sum + inv.refunds.reduce((s, r) => s + r.amount, 0), 0);
  const totalRefundsUsd = (sbtcRefunds > 0 ? parseFloat(amountToUsd(sbtcRefunds, 'sbtc', btcPriceUsd, stxPriceUsd)) || 0 : 0)
    + (stxRefunds > 0 ? parseFloat(amountToUsd(stxRefunds, 'stx', btcPriceUsd, stxPriceUsd)) || 0 : 0);

  // Build display string: show both tokens if both have volume
  const revenueDisplay = [
    sbtcRevenue > 0 ? `${formatAmount(sbtcRevenue, 'sbtc')} sBTC` : '',
    stxRevenue > 0 ? `${formatAmount(stxRevenue, 'stx')} STX` : '',
  ].filter(Boolean).join(' + ') || '0';

  const refundDisplay = [
    sbtcRefunds > 0 ? `${formatAmount(sbtcRefunds, 'sbtc')} sBTC` : '',
    stxRefunds > 0 ? `${formatAmount(stxRefunds, 'stx')} STX` : '',
  ].filter(Boolean).join(' + ') || '0';

  const activeInvoices = invoices.filter((inv) => inv.status === "pending" || inv.status === "partial").length;
  const activeSubs = subscribers.filter((s) => s.status === "active").length;

  // Empty state: brand-new merchant with no invoices, no subscribers, no direct payments.
  // Show a welcome card with clear next actions instead of blank charts.
  const isFreshAccount =
    invoices.length === 0 &&
    subscribers.length === 0 &&
    directSbtc === 0 &&
    directStx === 0;

  const stats = [
    { label: "Total Revenue", value: totalRevenueUsd, displayValue: revenueDisplay, unit: "", usd: totalRevenueUsd > 0 ? `$${totalRevenueUsd.toFixed(2)}` : "", icon: TrendingUp, change: "", accent: "success" as const },
    { label: "Active Invoices", value: activeInvoices, displayValue: String(activeInvoices), unit: "", usd: "", icon: FileText, change: "", accent: "primary" as const },
    { label: "Subscriptions", value: activeSubs, displayValue: String(activeSubs), unit: "", usd: "", icon: Repeat, change: "", accent: "secondary" as const },
    { label: "Refunds", value: totalRefundsUsd, displayValue: refundDisplay, unit: "", usd: totalRefundsUsd > 0 ? `$${totalRefundsUsd.toFixed(2)}` : "", icon: RefreshCcw, change: "", accent: "destructive" as const },
  ];

  return (
    <div className="flex flex-col gap-fluid-lg">
      <div>
        <h1 className="text-heading-lg font-display text-foreground">Dashboard</h1>
        <p className="text-body-sm text-muted-foreground mt-1">
          {isFreshAccount
            ? `Welcome${profile.name ? `, ${profile.name}` : ""} — your account is live.`
            : "Overview of your payment activity."}
        </p>
        <PriceStatusBadge />
      </div>

      {isFreshAccount && (
        <Card className="border-primary/30 bg-gradient-to-br from-primary/5 via-background to-secondary/5 overflow-hidden">
          <CardContent className="p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center gap-6">
            <div className="flex-1 min-w-0">
              <h2 className="text-heading-sm font-display text-foreground">
                Get your first payment in.
              </h2>
              <p className="mt-1.5 text-body-sm text-muted-foreground">
                Create an invoice with an amount + memo, share the link, and watch it land
                here in real time. Or grab a script tag to embed a Pay button on your site.
              </p>
              <div className="mt-4 flex flex-col sm:flex-row gap-2.5">
                <Button asChild size="sm" className="gap-2">
                  <Link to="/dashboard/invoices">
                    <FilePlus className="h-4 w-4" />
                    Create your first invoice
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="gap-2">
                  <Link to="/dashboard/widget">
                    <Code2 className="h-4 w-4" />
                    Generate an embed
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-space-md">
        {stats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      <RevenueChart />
      <MerchantAnalyticsPanel />
      <ActivityFeed />
    </div>
  );
}
export default DashboardOverview;
