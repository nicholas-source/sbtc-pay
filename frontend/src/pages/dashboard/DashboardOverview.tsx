import { TrendingUp, FileText, Repeat, RefreshCcw } from "lucide-react";
import { useMerchantStore } from "@/stores/merchant-store";
import { useInvoiceStore } from "@/stores/invoice-store";
import { useSubscriptionStore } from "@/stores/subscription-store";
import MerchantRegistration from "@/components/dashboard/MerchantRegistration";
import StatCard from "@/components/dashboard/StatCard";
import RevenueChart from "@/components/dashboard/RevenueChart";
import ActivityFeed from "@/components/dashboard/ActivityFeed";
import { MerchantAnalyticsPanel } from "@/components/dashboard/MerchantAnalyticsPanel";
import { amountToUsd, formatAmount } from "@/lib/constants";
import { useLivePrices } from "@/stores/wallet-store";
import { PriceStatusBadge } from "@/components/pay/PriceStatusBadge";

function DashboardOverview() {
  const profile = useMerchantStore((s) => s.profile);
  const invoices = useInvoiceStore((s) => s.invoices);
  const subscribers = useSubscriptionStore((s) => s.subscribers);
  const { btcPriceUsd, stxPriceUsd } = useLivePrices();

  if (!profile) {
    return <MerchantRegistration />;
  }

  // Split revenue & refunds by token type to avoid mixing sats and microSTX
  const sbtcInvoices = invoices.filter((inv) => inv.tokenType !== 'stx');
  const stxInvoices = invoices.filter((inv) => inv.tokenType === 'stx');

  const sbtcRevenue = sbtcInvoices.reduce((sum, inv) => sum + inv.amountPaid, 0);
  const stxRevenue = stxInvoices.reduce((sum, inv) => sum + inv.amountPaid, 0);
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
        <p className="text-body-sm text-muted-foreground mt-1">Overview of your payment activity.</p>
        <PriceStatusBadge />
      </div>

      <div className="grid gap-space-md" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
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
