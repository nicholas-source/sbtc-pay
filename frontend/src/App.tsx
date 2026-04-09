import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import { MotionConfig } from "framer-motion";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import CustomerLayout from "@/components/layout/CustomerLayout";
import CommandPalette from "@/components/dashboard/CommandPalette";
import DashboardSkeleton from "@/components/dashboard/DashboardSkeleton";
import InvoicesSkeleton from "@/components/dashboard/InvoicesSkeleton";
import RefundsSkeleton from "@/components/dashboard/RefundsSkeleton";
import SubscriptionsSkeleton from "@/components/dashboard/SubscriptionsSkeleton";
import SettingsSkeleton from "@/components/dashboard/SettingsSkeleton";
import { useWalletStore } from "@/stores/wallet-store";
import { startPricePolling, stopPricePolling } from "@/stores/wallet-store";
import { ErrorBoundary } from "@/components/ui/error-boundary";

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

const queryClient = new QueryClient();

// Initialize wallet connection on app load
function WalletInitializer() {
  const checkConnection = useWalletStore((state) => state.checkConnection);

  useEffect(() => {
    checkConnection();
    // Start live BTC price polling (CoinGecko, every 60 s)
    startPricePolling();
    return () => stopPricePolling();
  }, [checkConnection]);

  return null;
}

function PageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
}

function AnimatedRoutes() {
  return (
      <Routes>
        <Route path="/" element={<LandingPage />} />

        {/* Dashboard routes */}
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<Suspense fallback={<DashboardSkeleton />}><DashboardOverview /></Suspense>} />
          <Route path="invoices" element={<Suspense fallback={<InvoicesSkeleton />}><InvoicesPage /></Suspense>} />
          <Route path="refunds" element={<Suspense fallback={<RefundsSkeleton />}><RefundsPage /></Suspense>} />
          <Route path="subscriptions" element={<Suspense fallback={<SubscriptionsSkeleton />}><SubscriptionsPage /></Suspense>} />
          <Route path="settings" element={<Suspense fallback={<SettingsSkeleton />}><SettingsPage /></Suspense>} />
          <Route path="widget" element={<Suspense fallback={<DashboardSkeleton />}><WidgetGeneratorPage /></Suspense>} />
        </Route>

        {/* Admin */}
        <Route path="/admin" element={<ErrorBoundary><AdminPage /></ErrorBoundary>} />

        {/* Customer */}
        <Route path="/customer" element={<ErrorBoundary><CustomerLayout /></ErrorBoundary>}>
          <Route path="subscriptions" element={<CustomerSubscriptions />} />
          <Route path="payments" element={<CustomerPayments />} />
        </Route>

        {/* Widget embeds */}
        <Route path="/widget/:merchantAddress" element={<ErrorBoundary><DirectPaymentWidget /></ErrorBoundary>} />
        <Route path="/widget/invoice/:invoiceId" element={<ErrorBoundary><InvoicePaymentWidget /></ErrorBoundary>} />
        <Route path="/widget/subscribe/:merchantAddress" element={<ErrorBoundary><SubscriptionWidget /></ErrorBoundary>} />

        {/* Public payment page */}
        <Route path="/pay/:invoiceId" element={<ErrorBoundary><PaymentPage /></ErrorBoundary>} />

        <Route path="*" element={<NotFound />} />
      </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <MotionConfig reducedMotion="user">
    <TooltipProvider>
      <WalletInitializer />
      <Sonner />
      <BrowserRouter>
        <CommandPalette />
        <Suspense fallback={<PageLoader />}>
          <AnimatedRoutes />
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
    </MotionConfig>
  </QueryClientProvider>
);

export default App;
