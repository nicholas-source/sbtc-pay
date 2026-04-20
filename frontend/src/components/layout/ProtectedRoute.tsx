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
 * With persisted wallet state (address + isConnected in zustand persist),
 * on refresh we have the address immediately — no waiting. If the wallet
 * session turns out to be stale, checkConnection clears it in the background.
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
  const connectionChecked = useWalletStore((s) => s.connectionChecked);

  // If persisted state says connected, render immediately (don't wait for checkConnection)
  if (isConnected && address) {
    return <>{children}</>;
  }

  // No persisted state — wait for checkConnection to verify
  if (!connectionChecked || isConnecting) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background" role="status">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="sr-only">Connecting wallet…</span>
      </div>
    );
  }

  // checkConnection finished and still not connected → redirect to landing
  return <Navigate to="/" replace state={{ from: location.pathname }} />;
}
