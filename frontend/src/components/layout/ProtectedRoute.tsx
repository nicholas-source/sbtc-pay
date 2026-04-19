import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useWalletStore } from "@/stores/wallet-store";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * Route guard: requires a connected wallet.
 * Redirects to "/" if no wallet is connected.
 *
 * Handles the async gap on page refresh: wallet state hasn't been restored yet
 * (checkConnection runs after first render). We wait for that before redirecting.
 *
 * NOTE: Admin-level checks (contract owner) are intentionally NOT done here.
 * On-chain reads can fail (rate limits, network issues) which would lock out
 * the actual owner. Admin actions are protected on-chain (contract reverts
 * if caller ≠ owner) and via disabled UI buttons — that's the correct
 * security boundary for a blockchain app.
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const location = useLocation();
  const isConnected = useWalletStore((s) => s.isConnected);
  const address = useWalletStore((s) => s.address);
  const isConnecting = useWalletStore((s) => s.isConnecting);

  // Track whether the initial wallet check has completed.
  // On page refresh, isConnected/address are false/null until checkConnection resolves.
  const [walletChecked, setWalletChecked] = useState(isConnected);

  useEffect(() => {
    if (isConnected) {
      setWalletChecked(true);
      return;
    }

    // Give checkConnection time to run (fires in WalletInitializer's useEffect).
    // After a short grace period, if still not connected, allow the redirect.
    if (!isConnecting) {
      const timer = setTimeout(() => setWalletChecked(true), 150);
      return () => clearTimeout(timer);
    }
  }, [isConnected, isConnecting]);

  // Still waiting for wallet restoration on page refresh
  if (!walletChecked || isConnecting) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background" role="status">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="sr-only">Connecting wallet…</span>
      </div>
    );
  }

  // No wallet connected → redirect to landing
  if (!isConnected || !address) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
