import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { lazy, Suspense, useEffect, useRef } from "react";
import { MotionConfig } from "framer-motion";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import CustomerLayout from "@/components/layout/CustomerLayout";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
const CommandPalette = lazy(() => import("@/components/dashboard/CommandPalette"));
import DashboardSkeleton from "@/components/dashboard/DashboardSkeleton";
import InvoicesSkeleton from "@/components/dashboard/InvoicesSkeleton";
import RefundsSkeleton from "@/components/dashboard/RefundsSkeleton";
import SubscriptionsSkeleton from "@/components/dashboard/SubscriptionsSkeleton";
import SettingsSkeleton from "@/components/dashboard/SettingsSkeleton";
import { useWalletStore } from "@/stores/wallet-store";
import { startPricePolling, stopPricePolling } from "@/stores/wallet-store";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { NetworkStatus } from "@/components/ui/network-status";

// Lazy-loaded pages
const LandingPage = lazy(() => import("./pages/Index"));
const DashboardOverview = lazy(() => import("./pages/dashboard/DashboardOverview"));
const InvoicesPage = lazy(() => import("./pages/dashboard/InvoicesPage"));
const RefundsPage = lazy(() => import("./pages/dashboard/RefundsPage"));
const SubscriptionsPage = lazy(() => import("./pages/dashboard/SubscriptionsPage"));
const SettingsPage = lazy(() => import("./pages/dashboard/SettingsPage"));
const WidgetGeneratorPage = lazy(() => import("./pages/dashboard/WidgetGeneratorPage"));
const AdminPage = lazy(() => import("./pages/admin/AdminPage"));
const CustomerSubscriptions = lazy(() => import("./pages/customer/CustomerSubscriptions"));
const CustomerPayments = lazy(() => import("./pages/customer/CustomerPayments"));
const PaymentPage = lazy(() => import("./pages/pay/PaymentPage"));
const DirectPaymentWidget = lazy(() => import("./pages/widget/DirectPaymentWidget"));
const InvoicePaymentWidget = lazy(() => import("./pages/widget/InvoicePaymentWidget"));
const SubscriptionWidget = lazy(() => import("./pages/widget/SubscriptionWidget"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Docs
const DocsLayout = lazy(() => import("./pages/docs/DocsLayout"));
const DocsIntroduction = lazy(() => import("./pages/docs/pages/Introduction"));
const DocsQuickstart = lazy(() => import("./pages/docs/pages/Quickstart"));
const DocsInvoices = lazy(() => import("./pages/docs/pages/Invoices"));
const DocsSubscriptions = lazy(() => import("./pages/docs/pages/Subscriptions"));
const DocsRefunds = lazy(() => import("./pages/docs/pages/Refunds"));
const DocsDashboard = lazy(() => import("./pages/docs/pages/Dashboard"));
const DocsWidgets = lazy(() => import("./pages/docs/pages/Widgets"));
const DocsWidgetParameters = lazy(() => import("./pages/docs/pages/WidgetParameters"));
const DocsArchitecture = lazy(() => import("./pages/docs/pages/Architecture"));
const DocsSettlement = lazy(() => import("./pages/docs/pages/Settlement"));
const DocsTiming = lazy(() => import("./pages/docs/pages/Timing"));
const DocsContract = lazy(() => import("./pages/docs/pages/Contract"));
const DocsErrors = lazy(() => import("./pages/docs/pages/Errors"));
const DocsFaq = lazy(() => import("./pages/docs/pages/Faq"));
const DocsFees = lazy(() => import("./pages/docs/pages/Fees"));
const DocsNotifications = lazy(() => import("./pages/docs/pages/Notifications"));
const DocsStaticSiteExample = lazy(() => import("./pages/docs/pages/StaticSiteExample"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,      // Data fresh for 30 s — avoids refetch on every navigation
      gcTime: 10 * 60_000,    // Keep unused cache 10 min
      retry: 2,               // Retry failed requests twice
      refetchOnWindowFocus: false,
    },
  },
});

// Route title map for dynamic <title>
const ROUTE_TITLES: Record<string, string> = {
  "/": "sBTC Pay — Bitcoin Payments on Stacks",
  "/dashboard": "Dashboard | sBTC Pay",
  "/dashboard/invoices": "Invoices | sBTC Pay",
  "/dashboard/refunds": "Refunds | sBTC Pay",
  "/dashboard/subscriptions": "Subscriptions | sBTC Pay",
  "/dashboard/settings": "Settings | sBTC Pay",
  "/dashboard/widget": "Widget Generator | sBTC Pay",
  "/admin": "Admin | sBTC Pay",
  "/customer/subscriptions": "My Subscriptions | sBTC Pay",
  "/customer/payments": "My Payments | sBTC Pay",
  "/docs": "Documentation | sBTC Pay",
};

// Scroll to top, move focus for screen readers, and set page title on route change
function RouteAnnouncer() {
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement | null>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Set dynamic page title
    const title = ROUTE_TITLES[pathname] || "sBTC Pay";
    document.title = title;

    window.scrollTo(0, 0);

    // Skip focus management on initial load
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    // Move focus to main content area so screen readers announce the new page
    const main = mainRef.current || document.querySelector("main") || document.getElementById("root");
    if (main) {
      main.setAttribute("tabindex", "-1");
      main.focus({ preventScroll: true });
    }
  }, [pathname]);

  return null;
}

// Initialize wallet connection on app load
function WalletInitializer() {
  const checkConnection = useWalletStore((state) => state.checkConnection);
  const fetchBalances = useWalletStore((state) => state.fetchBalances);
  const address = useWalletStore((state) => state.address);

  // Run once on mount only — do NOT include address in deps.
  // When connect() sets address, we don't want to re-fire checkConnection.
  useEffect(() => {
    // If we have a persisted address, fetch balances immediately
    // (don't wait for checkConnection to download the wallet SDK)
    const currentAddress = useWalletStore.getState().address;
    if (currentAddress) {
      fetchBalances();
    }
    // Verify the session with the wallet SDK in the background
    checkConnection();
    // Start live BTC price polling (CoinGecko, every 60 s)
    startPricePolling();
    return () => stopPricePolling();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

function PageLoader() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background" role="status" aria-busy="true" aria-label="Loading page">
      <div className="h-6 w-6 sm:h-8 sm:w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

function AnimatedRoutes() {
  return (
      <Routes>
        <Route path="/" element={<ErrorBoundary><LandingPage /></ErrorBoundary>} />

        {/* Dashboard routes — requires connected wallet */}
        <Route path="/dashboard" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
          <Route index element={<Suspense fallback={<DashboardSkeleton />}><DashboardOverview /></Suspense>} />
          <Route path="invoices" element={<Suspense fallback={<InvoicesSkeleton />}><InvoicesPage /></Suspense>} />
          <Route path="refunds" element={<Suspense fallback={<RefundsSkeleton />}><RefundsPage /></Suspense>} />
          <Route path="subscriptions" element={<Suspense fallback={<SubscriptionsSkeleton />}><SubscriptionsPage /></Suspense>} />
          <Route path="settings" element={<Suspense fallback={<SettingsSkeleton />}><SettingsPage /></Suspense>} />
          <Route path="widget" element={<Suspense fallback={<DashboardSkeleton />}><WidgetGeneratorPage /></Suspense>} />
        </Route>

        {/* Admin — requires connected wallet; ownership enforced on-chain + UI */}
        <Route path="/admin" element={<ProtectedRoute><ErrorBoundary><Suspense fallback={<DashboardSkeleton />}><AdminPage /></Suspense></ErrorBoundary></ProtectedRoute>} />

        {/* Customer — requires connected wallet */}
        <Route path="/customer" element={<ProtectedRoute><ErrorBoundary><CustomerLayout /></ErrorBoundary></ProtectedRoute>}>
          <Route path="subscriptions" element={<CustomerSubscriptions />} />
          <Route path="payments" element={<CustomerPayments />} />
        </Route>

        {/* Widget embeds */}
        <Route path="/widget/:merchantAddress" element={<ErrorBoundary><DirectPaymentWidget /></ErrorBoundary>} />
        <Route path="/widget/invoice/:invoiceId" element={<ErrorBoundary><InvoicePaymentWidget /></ErrorBoundary>} />
        <Route path="/widget/subscribe/:merchantAddress" element={<ErrorBoundary><SubscriptionWidget /></ErrorBoundary>} />

        {/* Public payment page */}
        <Route path="/pay/:invoiceId" element={<ErrorBoundary><PaymentPage /></ErrorBoundary>} />

        {/* Documentation */}
        <Route path="/docs" element={<ErrorBoundary><DocsLayout /></ErrorBoundary>}>
          <Route index element={<DocsIntroduction />} />
          <Route path="quickstart" element={<DocsQuickstart />} />
          <Route path="invoices" element={<DocsInvoices />} />
          <Route path="subscriptions" element={<DocsSubscriptions />} />
          <Route path="refunds" element={<DocsRefunds />} />
          <Route path="dashboard" element={<DocsDashboard />} />
          <Route path="notifications" element={<DocsNotifications />} />
          <Route path="fees" element={<DocsFees />} />
          <Route path="widgets" element={<DocsWidgets />} />
          <Route path="widget-parameters" element={<DocsWidgetParameters />} />
          <Route path="examples/static-site" element={<DocsStaticSiteExample />} />
          <Route path="architecture" element={<DocsArchitecture />} />
          <Route path="settlement" element={<DocsSettlement />} />
          <Route path="timing" element={<DocsTiming />} />
          <Route path="contract" element={<DocsContract />} />
          <Route path="errors" element={<DocsErrors />} />
          <Route path="faq" element={<DocsFaq />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <MotionConfig reducedMotion="user">
    <TooltipProvider>
      <WalletInitializer />
      <NetworkStatus />
      <Sonner />
      <BrowserRouter>
        <RouteAnnouncer />
        <Suspense fallback={null}><CommandPalette /></Suspense>
        <Suspense fallback={<PageLoader />}>
          <AnimatedRoutes />
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
    </MotionConfig>
  </QueryClientProvider>
);

export default App;
