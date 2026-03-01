import { useWalletStore, useFormattedSbtcBalance, useSbtcBalanceInUsd, useFormattedStxBalance } from "@/stores/wallet-store";
import { useUIStore } from "@/stores/ui-store";
import { Button } from "@/components/ui/button";
import { Wallet, ChevronDown, LogOut, Copy, RefreshCw } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { truncateAddress } from "@/lib/stacks/config";

export function WalletButton() {
  const { isConnected, address, disconnect, fetchBalances } = useWalletStore();
  const { setWalletModalOpen } = useUIStore();
  const sbtcBalance = useFormattedSbtcBalance();
  const sbtcUsd = useSbtcBalanceInUsd();
  const stxBalance = useFormattedStxBalance();

  if (!isConnected) {
    return (
      <Button onClick={() => setWalletModalOpen(true)} className="gap-2" aria-label="Connect wallet">
        <Wallet className="h-4 w-4" />
        Connect Wallet
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2 border-border" aria-label="Wallet menu">
          <div className="h-2 w-2 rounded-full bg-success animate-pulse" role="status" aria-label="Connected" />
          <span className="font-mono-nums text-body-sm">{truncateAddress(address!)}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="px-3 py-2.5 space-y-2">
          <div className="flex justify-between text-body-sm">
            <span className="text-muted-foreground">sBTC</span>
            <div className="text-right">
              <div className="font-mono-nums font-semibold">{sbtcBalance} sats</div>
              <div className="text-caption text-muted-foreground">≈ ${sbtcUsd}</div>
            </div>
          </div>
          <div className="flex justify-between text-body-sm">
            <span className="text-muted-foreground">STX</span>
            <span className="font-mono-nums font-semibold">{stxBalance}</span>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => fetchBalances()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh Balances
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(address!);
              toast.success("Address copied");
            } catch {
              toast.error("Failed to copy address");
            }
          }}
        >
          <Copy className="mr-2 h-4 w-4" />
          Copy Address
        </DropdownMenuItem>
        <DropdownMenuItem onClick={disconnect} className="text-destructive focus:text-destructive">
          <LogOut className="mr-2 h-4 w-4" />
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
