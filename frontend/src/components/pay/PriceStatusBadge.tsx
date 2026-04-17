import { AlertTriangle, WifiOff } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePriceStale, useLivePrices } from "@/stores/wallet-store";

/**
 * Shows a contextual warning when USD prices are unavailable or stale.
 * - Prices null → "Prices unavailable" (no data at all)
 * - Prices stale (>5 min) → "Prices may be outdated"
 * - Prices fresh → renders nothing
 */
export function PriceStatusBadge() {
  const { btcPriceUsd, stxPriceUsd } = useLivePrices();
  const isStale = usePriceStale();

  const pricesUnavailable = btcPriceUsd === null && stxPriceUsd === null;

  if (!pricesUnavailable && !isStale) return null;

  const label = pricesUnavailable
    ? "USD prices unavailable — check your connection"
    : "USD prices may be outdated";

  const Icon = pricesUnavailable ? WifiOff : AlertTriangle;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-micro font-medium cursor-default ${
          pricesUnavailable
            ? "bg-destructive/10 text-destructive border border-destructive/30"
            : "bg-warning/10 text-warning border border-warning/30"
        }`}>
          <Icon className="h-3 w-3" />
          {pricesUnavailable ? "Prices unavailable" : "Prices updating…"}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[220px] text-center">
        <p className="text-xs">{label}</p>
      </TooltipContent>
    </Tooltip>
  );
}
