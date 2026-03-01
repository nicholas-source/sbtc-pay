import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useUIStore } from "@/stores/ui-store";
import { useWalletStore, WalletProvider } from "@/stores/wallet-store";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const wallets: { id: WalletProvider; name: string; description: string }[] = [
  { id: "leather", name: "Leather", description: "Browser extension wallet" },
  { id: "xverse", name: "Xverse", description: "Mobile & extension wallet" },
  { id: "asigna", name: "Asigna", description: "Multisig wallet" },
];

export function WalletModal() {
  const { walletModalOpen, setWalletModalOpen } = useUIStore();
  const { connect, isConnecting } = useWalletStore();

  const handleConnect = async (provider: WalletProvider) => {
    await connect(provider);
    setWalletModalOpen(false);
  };

  return (
    <Dialog open={walletModalOpen} onOpenChange={setWalletModalOpen}>
      <DialogContent className="sm:max-w-md border-border bg-card">
        <DialogHeader>
          <DialogTitle className="text-heading-sm">Connect Wallet</DialogTitle>
          <DialogDescription>
            Select a Stacks wallet to connect to sBTC Pay.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 pt-2">
          {wallets.map((w) => (
            <button
              key={w.id}
              disabled={isConnecting}
              onClick={() => handleConnect(w.id)}
              className={cn(
                "w-full flex items-center gap-4 rounded-lg border border-border bg-surface-1 p-4 text-left transition-all",
                "hover:border-primary/40 hover:bg-surface-2",
                "disabled:opacity-50 disabled:pointer-events-none"
              )}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-lg">
                {w.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-foreground">{w.name}</div>
                <div className="text-caption text-muted-foreground">{w.description}</div>
              </div>
              {isConnecting && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
