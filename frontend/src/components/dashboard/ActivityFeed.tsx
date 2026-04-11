import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowDownLeft, FileText, RefreshCcw, Repeat } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { formatSbtc } from "@/lib/constants";
import { useInvoiceStore } from "@/stores/invoice-store";
import { useSubscriptionStore } from "@/stores/subscription-store";
import { useMemo } from "react";

interface ActivityEvent {
  id: string;
  type: "payment" | "invoice" | "refund" | "subscription";
  title: string;
  amount: number;
  address: string;
  timestamp: Date;
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

  const events = useMemo(() => {
    const items: ActivityEvent[] = [];

    for (const inv of invoices) {
      // Invoice creation
      items.push({
        id: `inv-${inv.id}`,
        type: "invoice",
        title: "Invoice Created",
        amount: inv.amount,
        address: truncateAddr(inv.payerAddress || inv.merchantAddress),
        timestamp: new Date(inv.createdAt),
      });

      // Payments on this invoice
      for (const p of inv.payments) {
        items.push({
          id: `pay-${inv.id}-${p.txId}`,
          type: "payment",
          title: "Payment Received",
          amount: p.amount,
          address: truncateAddr(inv.payerAddress || ""),
          timestamp: new Date(p.timestamp),
        });
      }

      // Refunds on this invoice
      for (const r of inv.refunds) {
        items.push({
          id: `ref-${inv.id}-${r.txId}`,
          type: "refund",
          title: "Refund Issued",
          amount: r.amount,
          address: truncateAddr(inv.payerAddress || ""),
          timestamp: new Date(r.timestamp),
        });
      }
    }

    // Subscription payments
    for (const sub of subscribers) {
      for (const p of sub.payments || []) {
        items.push({
          id: `sub-${sub.id}-${p.txId}`,
          type: "subscription",
          title: "Subscription Payment",
          amount: p.amount,
          address: truncateAddr(sub.payerAddress || ""),
          timestamp: new Date(p.timestamp),
        });
      }
    }

    // Sort by most recent first, limit to 15
    items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return items.slice(0, 15);
  }, [invoices, subscribers]);
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

          <div className="space-y-1">
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
                        {event.type === "refund" ? "-" : "+"}{formatSbtc(event.amount)}
                        <span className="text-muted-foreground ml-1 text-caption">sBTC</span>
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
