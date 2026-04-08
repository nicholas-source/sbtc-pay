import { useWalletStore, useFormattedSbtcBalance, useSbtcBalanceInUsd, useFormattedStxBalance } from "@/stores/wallet-store";
import { Button } from "@/components/ui/button";
import { Wallet, ChevronDown, LogOut, Copy, RefreshCw, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { truncateAddress, NETWORK_MODE } from "@/lib/stacks/config";

export function WalletButton() {
  const { isConnected, isConnecting, address, disconnect, fetchBalances, connect, connectionError, clearError } = useWalletStore();
  const sbtcBalance = useFormattedSbtcBalance();
  const sbtcUsd = useSbtcBalanceInUsd();
  const stxBalance = useFormattedStxBalance();

  const handleConnect = async () => {
    clearError();
    await connect();
    const state = useWalletStore.getState();
    if (state.isConnected && !state.connectionError) {
      toast.success("Wallet connected", {
        style: {
          background: 'hsl(var(--success))',
          color: 'hsl(var(--success-foreground))',
          border: '1px solid hsl(var(--success))',
        },
      });
    } else if (state.connectionError?.type === 'network_mismatch') {
      toast.error(
        `Wrong network. Please switch to ${NETWORK_MODE} in your wallet settings, then try again`,
        { 
          duration: 8000,
          style: {
            background: 'hsl(var(--destructive))',
            color: 'hsl(var(--destructive-foreground))',
            border: '1px solid hsl(var(--destructive))',
          },
        }
      );
    }
  };

  if (!isConnected) {
    return (
      <div className="flex items-center gap-2">
        {/* Network indicator */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/10 border border-primary/30 text-primary text-caption font-medium cursor-help">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              Testnet
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <div className="space-y-1">
              <p className="font-semibold">Testnet Mode</p>
              <p className="text-muted-foreground">
                sBTC Pay is running on Stacks Testnet. Make sure your wallet is set to Testnet before connecting.
              </p>
            </div>
          </TooltipContent>
        </Tooltip>

        <Button 
          onClick={handleConnect} 
          disabled={isConnecting}
          className="gap-2" 
          aria-label="Connect wallet"
        >
          {isConnecting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Connecting...
            </>
          ) : (
            <>
              <Wallet className="h-4 w-4" />
              Connect Wallet
            </>
          )}
        </Button>
      </div>
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
              toast.error("Couldn't copy the address. Check your browser permissions.");
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
