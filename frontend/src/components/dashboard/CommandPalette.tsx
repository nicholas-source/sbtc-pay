import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  FileText,
  RefreshCcw,
  Repeat,
  Settings,
  Code2,
  Shield,
  Wallet,
  Plus,
  CreditCard,
} from "lucide-react";
import { useWalletStore } from "@/stores/wallet-store";
import { toast } from "sonner";
import { NETWORK_MODE } from "@/lib/stacks/config";

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { connect, clearError, isConnected } = useWalletStore();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const go = useCallback(
    (path: string) => {
      navigate(path);
      setOpen(false);
    },
    [navigate]
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => go("/dashboard")}>
            <LayoutDashboard className="mr-2 h-4 w-4" /> Dashboard
          </CommandItem>
          <CommandItem onSelect={() => go("/dashboard/invoices")}>
            <FileText className="mr-2 h-4 w-4" /> Invoices
          </CommandItem>
          <CommandItem onSelect={() => go("/dashboard/refunds")}>
            <RefreshCcw className="mr-2 h-4 w-4" /> Refunds
          </CommandItem>
          <CommandItem onSelect={() => go("/dashboard/subscriptions")}>
            <Repeat className="mr-2 h-4 w-4" /> Subscriptions
          </CommandItem>
          <CommandItem onSelect={() => go("/dashboard/settings")}>
            <Settings className="mr-2 h-4 w-4" /> Settings
          </CommandItem>
          <CommandItem onSelect={() => go("/dashboard/widget")}>
            <Code2 className="mr-2 h-4 w-4" /> Widget Generator
          </CommandItem>
          <CommandItem onSelect={() => go("/admin")}>
            <Shield className="mr-2 h-4 w-4" /> Admin Panel
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Actions">
          <CommandItem onSelect={async () => { 
            setOpen(false); 
            if (isConnected) {
              toast.info("Wallet already connected");
              return;
            }
            clearError();
            await connect();
            const state = useWalletStore.getState();
            if (state.isConnected && !state.connectionError) {
              toast.success("Wallet connected!", {
                style: {
                  background: 'hsl(var(--success))',
                  color: 'hsl(var(--success-foreground))',
                  border: '1px solid hsl(var(--success))',
                },
              });
            } else if (state.connectionError?.type === 'network_mismatch') {
              toast.error(`Wrong network! Please switch to ${NETWORK_MODE} in your wallet.`, { 
                duration: 8000,
                style: {
                  background: 'hsl(var(--destructive))',
                  color: 'hsl(var(--destructive-foreground))',
                  border: '1px solid hsl(var(--destructive))',
                },
              });
            }
          }}>
            <Wallet className="mr-2 h-4 w-4" /> Connect Wallet
          </CommandItem>
          <CommandItem onSelect={() => go("/dashboard/invoices")}>
            <Plus className="mr-2 h-4 w-4" /> Create Invoice
          </CommandItem>
          <CommandItem onSelect={() => go("/customer/payments")}>
            <CreditCard className="mr-2 h-4 w-4" /> Payment History
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
