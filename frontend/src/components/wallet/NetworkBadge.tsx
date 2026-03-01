import { useWalletStore } from "@/stores/wallet-store";
import { cn } from "@/lib/utils";

export function NetworkBadge() {
  const { network } = useWalletStore();
  const isTestnet = network === "testnet";

  return (
    <div
      role="status"
      aria-label={`Network: ${isTestnet ? "Testnet" : "Mainnet"}`}
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-caption font-semibold",
        isTestnet
          ? "bg-warning/10 text-warning"
          : "bg-success/10 text-success"
      )}
    >
      <div
        className={cn(
          "h-2 w-2 rounded-full",
          isTestnet ? "bg-warning" : "bg-success"
        )}
      />
      {isTestnet ? "Testnet" : "Mainnet"}
    </div>
  );
}
