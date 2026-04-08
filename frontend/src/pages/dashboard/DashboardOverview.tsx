import { TrendingUp, FileText, Repeat, RefreshCcw } from "lucide-react";
import { useMerchantStore } from "@/stores/merchant-store";
import MerchantRegistration from "@/components/dashboard/MerchantRegistration";
import StatCard from "@/components/dashboard/StatCard";
import RevenueChart from "@/components/dashboard/RevenueChart";
import ActivityFeed from "@/components/dashboard/ActivityFeed";

const stats = [
  { label: "Total Revenue", value: 2847500, displayValue: "2,847,500", unit: "sats", usd: "$2,776.31", icon: TrendingUp, change: "+12.5%", accent: "success" as const },
  { label: "Active Invoices", value: 23, displayValue: "23", unit: "", usd: "", icon: FileText, change: "+3", accent: "primary" as const },
  { label: "Subscriptions", value: 8, displayValue: "8", unit: "", usd: "", icon: Repeat, change: "+1", accent: "secondary" as const },
  { label: "Refunds", value: 2, displayValue: "2", unit: "", usd: "$54.20", icon: RefreshCcw, change: "0", accent: "destructive" as const },
];

function DashboardOverview() {
  const profile = useMerchantStore((s) => s.profile);

  if (!profile) {
    return <MerchantRegistration />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-heading-lg text-foreground">Dashboard</h1>
        <p className="text-body-sm text-muted-foreground mt-1">Overview of your sBTC payment activity.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      <RevenueChart />
      <ActivityFeed />
    </div>
  );
}
export default DashboardOverview;
