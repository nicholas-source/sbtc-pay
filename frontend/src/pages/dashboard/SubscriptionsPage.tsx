import { useCallback, useMemo } from "react";
import { Layers, Users, TrendingUp, Download } from "lucide-react";
import { format } from "date-fns";
import StatCard from "@/components/dashboard/StatCard";
import SubscriptionAnalyticsChart from "@/components/subscription/SubscriptionAnalyticsChart";
import CreatePlanDialog from "@/components/subscription/CreatePlanDialog";
import PlanCard from "@/components/subscription/PlanCard";
import { Button } from "@/components/ui/button";
import { useSubscriptionStore } from "@/stores/subscription-store";
import { exportToCSV } from "@/lib/export-csv";
import EmptyState from "@/components/dashboard/EmptyState";

import { formatAmount, amountToUsd, tokenLabel } from "@/lib/constants";
import { useLivePrices } from "@/stores/wallet-store";

function SubscriptionsPage() {
  const plans = useSubscriptionStore((s) => s.plans);
  const subscribers = useSubscriptionStore((s) => s.subscribers);
  const { btcPriceUsd, stxPriceUsd } = useLivePrices();

  const stats = useMemo(() => {
    const activeSubs = subscribers.filter((s) => s.status === "active");

    // Split monthly revenue by token type
    let sbtcRevenue = 0;
    let stxRevenue = 0;
    plans.filter((p) => p.isActive).forEach((plan) => {
      const count = subscribers.filter(
        (s) => s.planId === plan.id && s.status === "active"
      ).length;
      let monthly = plan.amount * count;
      if (plan.interval === "weekly") monthly *= 4;
      if (plan.interval === "yearly") monthly /= 12;
      if (plan.tokenType === 'stx') stxRevenue += monthly;
      else sbtcRevenue += monthly;
    });

    sbtcRevenue = Math.round(sbtcRevenue);
    stxRevenue = Math.round(stxRevenue);
    const revenueUsd = (sbtcRevenue > 0 ? parseFloat(amountToUsd(sbtcRevenue, 'sbtc', btcPriceUsd, stxPriceUsd)) || 0 : 0)
      + (stxRevenue > 0 ? parseFloat(amountToUsd(stxRevenue, 'stx', btcPriceUsd, stxPriceUsd)) || 0 : 0);
    const revenueDisplay = [
      sbtcRevenue > 0 ? `${formatAmount(sbtcRevenue, 'sbtc')} sBTC` : '',
      stxRevenue > 0 ? `${formatAmount(stxRevenue, 'stx')} STX` : '',
    ].filter(Boolean).join(' + ') || '0';

    return {
      totalPlans: plans.length,
      activeSubscribers: activeSubs.length,
      revenueDisplay,
      revenueUsd,
    };
  }, [plans, subscribers, btcPriceUsd, stxPriceUsd]);

  const handleExport = useCallback(() => {
    const rows: Record<string, string | number>[] = [];
    for (const sub of subscribers) {
      const plan = plans.find((p) => p.id === sub.planId);
      const base = {
        "Plan Name": plan?.name ?? "",
        "Plan Amount": plan?.amount ?? "",
        "Token": plan?.tokenType ?? "sbtc",
        Interval: plan?.interval ?? "",
        "Subscriber Address": sub.payerAddress,
        Status: sub.status,
        "Started At": format(sub.startedAt, "yyyy-MM-dd"),
      };
      if (sub.payments.length === 0) {
        rows.push({ ...base, "Payment Date": "", "Payment Amount": "", "TX ID": "" });
      } else {
        for (const p of sub.payments) {
          rows.push({
            ...base,
            "Payment Date": format(p.timestamp, "yyyy-MM-dd"),
            "Payment Amount": p.amount,
            "TX ID": p.txId,
          });
        }
      }
    }
    exportToCSV(rows, `subscribers-export-${format(new Date(), "yyyy-MM-dd")}.csv`);
  }, [plans, subscribers]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-heading-lg text-foreground">Subscriptions</h1>
          <p className="text-body-sm text-muted-foreground mt-1">
            Manage recurring payment plans and subscribers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-1 h-4 w-4" />
            Export CSV
          </Button>
          <CreatePlanDialog />
        </div>
      </div>

      {plans.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No subscription plans"
          description="Create your first recurring payment plan to start collecting recurring payments."
          action={<CreatePlanDialog />}
        />
      ) : (
        <>
          {/* Stats */}
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Total Plans" value={stats.totalPlans} displayValue={stats.totalPlans.toString()} icon={Layers} change="+1 this month" accent="secondary" />
            <StatCard label="Active Subscribers" value={stats.activeSubscribers} displayValue={stats.activeSubscribers.toString()} icon={Users} change="+2 this month" accent="info" />
            <StatCard label="Monthly Revenue" value={stats.revenueUsd} displayValue={stats.revenueDisplay} unit="" usd={stats.revenueUsd > 0 ? `≈ $${stats.revenueUsd.toFixed(2)}` : ""} icon={TrendingUp} change="+12%" accent="success" />
          </div>

          {/* Analytics Chart */}
          <SubscriptionAnalyticsChart />

          {/* Plan Cards */}
          <div className="grid gap-4 md:grid-cols-2">
            {plans.map((plan) => (
              <PlanCard key={plan.id} plan={plan} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
export default SubscriptionsPage;
