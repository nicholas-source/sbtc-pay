import { useEffect } from "react";
import { Outlet, NavLink } from "react-router-dom";
import { Repeat, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";
import { WalletButton } from "@/components/wallet/WalletButton";
import { useWalletStore } from "@/stores/wallet-store";
import { useSubscriptionStore } from "@/stores/subscription-store";

const tabs = [
  { to: "/customer/subscriptions", icon: Repeat, label: "Subscriptions" },
  { to: "/customer/payments", icon: CreditCard, label: "Payments" },
];

export default function CustomerLayout() {
  const walletAddress = useWalletStore((s) => s.address);
  const fetchMySubscriptions = useSubscriptionStore((s) => s.fetchMySubscriptions);

  useEffect(() => {
    if (walletAddress) {
      fetchMySubscriptions(walletAddress);
    }
  }, [walletAddress, fetchMySubscriptions]);

  return (
    <div className="min-h-svh bg-background">
      <header className="border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-30">
        <div className="mx-auto max-w-4xl flex items-center justify-between px-3 sm:px-4 h-14 sm:h-16">
          <div className="flex items-center gap-3">
            <img
              src="/favicon.png"
              className="h-9 w-9 sm:h-10 sm:w-10 shrink-0 rounded-xl object-contain"
              alt="sBTC Pay"
            />
            <span className="text-lg font-bold text-foreground">sBTC Pay</span>
          </div>

          <nav className="hidden sm:flex items-center gap-1">
            {tabs.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors focus-ring",
                    isActive
                      ? "bg-accent text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )
                }
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </NavLink>
            ))}
          </nav>

          <WalletButton />
        </div>

        {/* Mobile tabs */}
        <div className="sm:hidden border-t border-border flex">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                cn(
                  "flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors",
                  isActive
                    ? "text-primary border-b-2 border-primary"
                    : "text-muted-foreground"
                )
              }
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </NavLink>
          ))}
        </div>
      </header>

      <Outlet />
    </div>
  );
}
