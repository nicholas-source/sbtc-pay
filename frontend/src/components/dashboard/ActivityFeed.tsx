import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowDownLeft, FileText, RefreshCcw, Repeat } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { formatAmount, tokenLabel } from "@/lib/constants";
import { useInvoiceStore } from "@/stores/invoice-store";
import { useSubscriptionStore } from "@/stores/subscription-store";
import { useWalletStore } from "@/stores/wallet-store";
import { supabaseWithWallet } from "@/lib/supabase/client";
import { useEffect, useMemo, useState } from "react";
import type { TokenType } from "@/lib/stacks/config";

// Direct payments don't have a Zustand store yet — fetched here directly.
// Limit small because this feed only shows the most recent 15 items overall.
const DIRECT_PAYMENTS_LIMIT = 15;

interface DirectPaymentRow {
  id: number;
  amount: number;
  payer: string;
  created_at: string;
  token_type: string | null;
}

interface ActivityEvent {
  id: string;
  type: "payment" | "invoice" | "refund" | "subscription";
  title: string;
  amount: number;
  address: string;
  timestamp: Date;
  tokenType: TokenType;
}

const iconMap = {
  payment: ArrowDownLeft,
  invoice: FileText,
  refund: RefreshCcw,
  subscription: Repeat,
};

const colorMap = {
  payment: "text-success",
  invoice: "text-primary",
  refund: "text-destructive",
  subscription: "text-info",
};

const bgMap = {
  payment: "bg-success/20",
  invoice: "bg-primary/20",
  refund: "bg-destructive/20",
  subscription: "bg-info/20",
};

function truncateAddr(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function ActivityFeed() {
  const invoices = useInvoiceStore((s) => s.invoices);
  const subscribers = useSubscriptionStore((s) => s.subscribers);
  const plans = useSubscriptionStore((s) => s.plans);
  const { address, isAuthenticated } = useWalletStore();

  const [directPayments, setDirectPayments] = useState<DirectPaymentRow[]>([]);

  useEffect(() => {
    if (!address || !isAuthenticated) {
      setDirectPayments([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const client = supabaseWithWallet(address);
      const { data, error } = await client
        .from("direct_payments")
        .select("id, amount, payer, created_at, token_type")
        .eq("merchant_principal", address)
        .order("block_height", { ascending: false })
        .limit(DIRECT_PAYMENTS_LIMIT);
      if (cancelled || error || !data) return;
      setDirectPayments(data as DirectPaymentRow[]);
    })();
    return () => { cancelled = true; };
  }, [address, isAuthenticated]);

  const events = useMemo(() => {
    const items: ActivityEvent[] = [];

    for (const inv of invoices) {
      const invToken = inv.tokenType ?? 'sbtc';
      // Invoice creation
      items.push({
        id: `inv-${inv.id}`,
        type: "invoice",
        title: "Invoice Created",
        amount: inv.amount,
        address: truncateAddr(inv.payerAddress || inv.merchantAddress),
        timestamp: new Date(inv.createdAt),
        tokenType: invToken,
      });

      // Payments on this invoice
      for (let pi = 0; pi < (inv.payments ?? []).length; pi++) {
        const p = inv.payments[pi];
        items.push({
          id: `pay-${inv.id}-${p.txId || pi}`,
          type: "payment",
          title: "Payment Received",
          amount: p.amount,
          address: truncateAddr(p.payer || inv.payerAddress || ""),
          timestamp: new Date(p.timestamp),
          tokenType: invToken,
        });
      }

      // Refunds on this invoice
      for (let ri = 0; ri < (inv.refunds ?? []).length; ri++) {
        const r = inv.refunds[ri];
        items.push({
          id: `ref-${inv.id}-${r.txId || ri}`,
          type: "refund",
          title: "Refund Issued",
          amount: r.amount,
          address: truncateAddr(inv.payerAddress || inv.merchantAddress),
          timestamp: new Date(r.timestamp),
          tokenType: invToken,
        });
      }
    }

    // Subscription payments
    for (const sub of subscribers) {
      const plan = plans.find((p) => p.id === sub.planId);
      const subToken = plan?.tokenType ?? 'sbtc';
      for (const p of sub.payments || []) {
        items.push({
          id: `sub-${sub.id}-${p.txId}`,
          type: "subscription",
          title: "Subscription Payment",
          amount: p.amount,
          address: truncateAddr(sub.payerAddress || ""),
          timestamp: new Date(p.timestamp),
          tokenType: subToken,
        });
      }
    }

    // Direct payments (pay-merchant-direct / pay-merchant-direct-stx).
    for (const dp of directPayments) {
      items.push({
        id: `direct-${dp.id}`,
        type: "payment",
        title: "Direct Payment",
        amount: dp.amount,
        address: truncateAddr(dp.payer || ""),
        timestamp: new Date(dp.created_at),
        tokenType: (dp.token_type === "stx" ? "stx" : "sbtc") as TokenType,
      });
    }

    // Sort by most recent first, limit to 15
    items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return items.slice(0, 15);
  }, [invoices, subscribers, plans, directPayments]);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-heading-sm">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
            No activity yet. Create your first invoice to get started.
          </div>
        ) : (
        <div className="relative" aria-live="polite">
          {/* Timeline line */}
          <div className="absolute left-2.5 sm:left-4 top-0 bottom-0 w-px bg-border" />

          <div className="flex flex-col gap-1">
            {events.map((event, i) => {
              const Icon = iconMap[event.type];
              const stagger = i < 8 ? `stagger-${i + 1}` : "";
              return (
                <div
                  key={event.id}
                  className={`relative flex items-start gap-3 py-2 pl-1 animate-fade-slide-up ${stagger}`}
                >
                  {/* Dot */}
                  <div className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${bgMap[event.type]}`}>
                    <Icon className={`h-3.5 w-3.5 ${colorMap[event.type]}`} />
                  </div>

                  <div className="flex flex-1 items-center justify-between min-w-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{event.title}</p>
                      <p className="text-caption text-muted-foreground truncate">{event.address}</p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="font-mono-nums text-sm text-foreground">
                        {event.type === "refund" ? "-" : "+"}{formatAmount(event.amount, event.tokenType)}
                        <span className="text-muted-foreground ml-1 text-caption">{tokenLabel(event.tokenType)}</span>
                      </p>
                      <p className="text-caption text-muted-foreground">
                        {formatDistanceToNow(event.timestamp, { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        )}
      </CardContent>
    </Card>
  );
}
