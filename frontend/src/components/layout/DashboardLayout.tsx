import { Outlet, NavLink, useLocation, Link } from "react-router-dom";
import { useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { ErrorBoundary } from "@/components/ui/error-boundary";

import {
  LayoutDashboard,
  FileText,
  RefreshCcw,
  Repeat,
  Settings,
  Shield,
  Menu,
  X,
  Code2,
  Home,
  ArrowLeftRight,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";
import DashboardBreadcrumb from "@/components/dashboard/DashboardBreadcrumb";
import { WalletButton } from "@/components/wallet/WalletButton";
import { NetworkBadge } from "@/components/wallet/NetworkBadge";
import { useWalletStore } from "@/stores/wallet-store";
import { useMerchantStore } from "@/stores/merchant-store";
import { useInvoiceStore } from "@/stores/invoice-store";
import { useSubscriptionStore } from "@/stores/subscription-store";
import { useAdminStore } from "@/stores/admin-store";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Overview", end: true },
  { to: "/dashboard/invoices", icon: FileText, label: "Invoices" },
  { to: "/dashboard/transactions", icon: ArrowLeftRight, label: "Transactions" },
  { to: "/dashboard/refunds", icon: RefreshCcw, label: "Refunds" },
  { to: "/dashboard/subscriptions", icon: Repeat, label: "Subscriptions" },
  { to: "/dashboard/widget", icon: Code2, label: "Widgets" },
  { to: "/dashboard/settings", icon: Settings, label: "Settings" },
];

export function DashboardLayout() {
  const { sidebarOpen, toggleSidebar, setSidebarOpen } = useUIStore();
  const location = useLocation();
  const toggleButtonRef = useRef<HTMLButtonElement>(null);
  const walletAddress = useWalletStore((s) => s.address);
  const fetchMerchant = useMerchantStore((s) => s.fetchMerchant);
  const fetchInvoices = useInvoiceStore((s) => s.fetchInvoices);
  const fetchSubscriptions = useSubscriptionStore((s) => s.fetchSubscriptions);
  const isContractOwner = useAdminStore((s) => s.isContractOwner);

  // Bootstrap data when wallet is connected
  // Use a ref to prevent StrictMode double-firing from making duplicate API calls
  const lastFetchedAddress = useRef<string | null>(null);
  useEffect(() => {
    if (walletAddress && walletAddress !== lastFetchedAddress.current) {
      lastFetchedAddress.current = walletAddress;
      fetchMerchant(walletAddress);
      fetchInvoices(walletAddress);
      fetchSubscriptions(walletAddress);
    }
  }, [walletAddress, fetchMerchant, fetchInvoices, fetchSubscriptions]);

  // Background refresh every 30 seconds to pick up chainhook-indexed data
  // and resolve optimistic invoices faster
  useEffect(() => {
    if (!walletAddress) return;
    const interval = setInterval(() => {
      fetchInvoices(walletAddress);
      fetchSubscriptions(walletAddress);
    }, 30_000);
    return () => clearInterval(interval);
  }, [walletAddress, fetchInvoices, fetchSubscriptions]);

  // Auto-close sidebar on route change for mobile
  useEffect(() => {
    if (window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  }, [location.pathname, setSidebarOpen]);

  // Close sidebar on Escape key (mobile)
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && sidebarOpen && window.innerWidth < 1024) {
        setSidebarOpen(false);
        toggleButtonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [sidebarOpen, setSidebarOpen]);

  const handleOverlayClick = useCallback(() => {
    setSidebarOpen(false);
    toggleButtonRef.current?.focus();
  }, [setSidebarOpen]);

  return (
    <div className="flex h-svh bg-background overflow-hidden">
      {/* Skip navigation */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Sidebar */}
      <aside
        aria-label="Main navigation"
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300 lg:relative overflow-y-auto",
          sidebarOpen ? "w-64" : "w-0 lg:w-16"
        )}
      >
        {/* Logo */}
        <Link
          to="/"
          className={cn(
            "flex h-16 items-center border-b border-sidebar-border px-4 hover:bg-sidebar-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
            sidebarOpen ? "gap-3 justify-start" : "gap-0 justify-center"
          )}
        >
          <img
            src="/favicon.png"
            className="h-10 w-10 shrink-0 rounded-xl object-contain"
            alt="sBTC Pay home"
          />
          {sidebarOpen && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-lg font-bold text-foreground whitespace-nowrap"
            >
              sBTC Pay
            </motion.span>
          )}
        </Link>

        {/* Nav */}
        <nav aria-label="Dashboard navigation" className="flex-1 overflow-y-auto scrollbar-thin px-2 py-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              aria-label={!sidebarOpen ? item.label : undefined}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-body-sm font-medium transition-colors focus-ring",
                  isActive
                    ? "bg-sidebar-accent text-primary border-l-3 border-primary"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )
              }
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {sidebarOpen && <span>{item.label}</span>}
            </NavLink>
          ))}

          {/* Admin link — only visible to contract owner */}
          {isContractOwner && (
            <NavLink
              to="/admin"
              aria-label={!sidebarOpen ? "Admin" : undefined}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-body-sm font-medium transition-colors focus-ring",
                  isActive
                    ? "bg-sidebar-accent text-primary border-l-3 border-primary"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )
              }
            >
              <Shield className="h-5 w-5 shrink-0" />
              {sidebarOpen && <span>Admin</span>}
            </NavLink>
          )}
        </nav>

        {/* Command palette shortcut hint */}
        <div className="px-2 pt-2 border-t border-sidebar-border">
          <button
            onClick={() =>
              document.dispatchEvent(
                new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true, cancelable: true })
              )
            }
            aria-label="Open command palette"
            className={cn(
              "w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-body-sm font-medium transition-colors focus-ring",
              "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
          >
            <Search className="h-5 w-5 shrink-0" />
            {sidebarOpen && (
              <>
                <span className="flex-1 text-left">Commands</span>
                <kbd className="hidden lg:inline-flex items-center gap-0.5 rounded border border-sidebar-border bg-sidebar px-1 py-0.5 font-mono text-micro text-muted-foreground">
                  ⌘K
                </kbd>
              </>
            )}
          </button>
        </div>

        {/* Home link at bottom */}
        <div className="px-2 py-2">
          <Link
            to="/"
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-body-sm font-medium transition-colors focus-ring",
              "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
          >
            <Home className="h-5 w-5 shrink-0" />
            {sidebarOpen && <span>Back to Home</span>}
          </Link>
        </div>

        {/* Network badge at bottom */}
        {sidebarOpen && (
          <div className="border-t border-sidebar-border p-4">
            <NetworkBadge />
          </div>
        )}
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          role="presentation"
          onClick={handleOverlayClick}
        />
      )}

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header aria-label="Dashboard toolbar" className="flex h-14 sm:h-16 shrink-0 items-center justify-between border-b border-border bg-background px-3 sm:px-4 lg:px-6">
          <button
            ref={toggleButtonRef}
            onClick={toggleSidebar}
            aria-label="Toggle sidebar"
            aria-expanded={sidebarOpen}
            aria-controls="sidebar-nav"
            className="rounded-lg p-2.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors focus-ring"
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <WalletButton />
        </header>

        {/* Page content */}
        <div id="main-content" className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="p-fluid-md lg:p-fluid-lg">
            <div className="mx-auto max-w-7xl">
              <DashboardBreadcrumb />
              <ErrorBoundary>
                <Outlet />
              </ErrorBoundary>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
