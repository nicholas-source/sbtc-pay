import { Outlet, NavLink, useLocation } from "react-router-dom";
import { useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { PageTransition } from "@/components/layout/PageTransition";
import {
  LayoutDashboard,
  FileText,
  RefreshCcw,
  Repeat,
  Settings,
  Shield,
  Menu,
  X,
  Bitcoin,
  Code2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";
import DashboardBreadcrumb from "@/components/dashboard/DashboardBreadcrumb";
import { useWalletStore } from "@/stores/wallet-store";
import { WalletButton } from "@/components/wallet/WalletButton";
import { NetworkBadge } from "@/components/wallet/NetworkBadge";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Overview", end: true },
  { to: "/dashboard/invoices", icon: FileText, label: "Invoices" },
  { to: "/dashboard/refunds", icon: RefreshCcw, label: "Refunds" },
  { to: "/dashboard/subscriptions", icon: Repeat, label: "Subscriptions" },
  { to: "/dashboard/widget", icon: Code2, label: "Widgets" },
  { to: "/dashboard/settings", icon: Settings, label: "Settings" },
];

export function DashboardLayout() {
  const { sidebarOpen, toggleSidebar, setSidebarOpen } = useUIStore();
  const location = useLocation();
  const toggleButtonRef = useRef<HTMLButtonElement>(null);

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
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Skip navigation */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Sidebar */}
      <aside
        aria-label="Main navigation"
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300 lg:relative overflow-hidden",
          sidebarOpen ? "w-64" : "w-0 lg:w-16"
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary">
            <Bitcoin className="h-5 w-5 text-primary-foreground" />
          </div>
          {sidebarOpen && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-lg font-bold text-foreground whitespace-nowrap"
            >
              sBTC Pay
            </motion.span>
          )}
        </div>

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
                    ? "bg-sidebar-accent text-primary"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )
              }
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {sidebarOpen && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

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
          className="fixed inset-0 z-30 bg-background/60 backdrop-blur-sm lg:hidden"
          role="presentation"
          onClick={handleOverlayClick}
        />
      )}

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header aria-label="Dashboard toolbar" className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-background/80 backdrop-blur-md px-4 lg:px-6">
          <button
            ref={toggleButtonRef}
            onClick={toggleSidebar}
            aria-label="Toggle sidebar"
            aria-expanded={sidebarOpen}
            aria-controls="sidebar-nav"
            className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors focus-ring"
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <WalletButton />
        </header>

        {/* Page content */}
        <div id="main-content" className="flex-1 overflow-y-auto scrollbar-thin">
          <AnimatePresence mode="wait">
            <PageTransition key={location.pathname} className="p-4 lg:p-6">
              <DashboardBreadcrumb />
              <ErrorBoundary>
                <Outlet />
              </ErrorBoundary>
            </PageTransition>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
