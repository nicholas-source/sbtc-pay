import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useUIStore } from "@/stores/ui-store";
import { useWalletStore } from "@/stores/wallet-store";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function WalletModal() {
  const { walletModalOpen, setWalletModalOpen } = useUIStore();
  const { connect, isConnecting } = useWalletStore();

  const handleConnect = async () => {
    try {
      await connect();
      setWalletModalOpen(false);
      toast.success("Wallet connected successfully!");
    } catch (error) {
      console.error("Connection failed:", error);
      toast.error("Failed to connect wallet. Please try again.");
    }
  };

  return (
    <Dialog open={walletModalOpen} onOpenChange={setWalletModalOpen}>
      <DialogContent className="sm:max-w-md border-border bg-card">
        <DialogHeader>
          <DialogTitle className="text-heading-sm">Connect Wallet</DialogTitle>
          <DialogDescription>
            Connect your Stacks wallet to use sBTC Pay. Supports Leather, Xverse, and other Stacks wallets.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <button
            disabled={isConnecting}
            onClick={handleConnect}
            className={cn(
              "w-full flex items-center justify-center gap-3 rounded-xl border border-primary/30 bg-gradient-to-b from-primary/20 to-primary/10 p-4 text-center transition-all",
              "hover:border-primary/50 hover:from-primary/30 hover:to-primary/20",
              "disabled:opacity-50 disabled:pointer-events-none"
            )}
          >
            {isConnecting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="font-semibold text-foreground">Connecting...</span>
              </>
            ) : (
              <>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-lg">
                  ₿
                </div>
                <div className="text-left">
                  <div className="font-semibold text-foreground">Connect Stacks Wallet</div>
                  <div className="text-caption text-muted-foreground">Leather, Xverse, or compatible wallet</div>
                </div>
              </>
            )}
          </button>
          <p className="text-xs text-center text-muted-foreground">
            By connecting, you agree to the Terms of Service and Privacy Policy.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
