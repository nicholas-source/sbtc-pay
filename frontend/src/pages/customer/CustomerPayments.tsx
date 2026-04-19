import { useMemo } from "react";
import { PageTransition } from "@/components/layout/PageTransition";
import { format } from "date-fns";
import { Inbox, ExternalLink, Bitcoin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollableTable } from "@/components/ui/scrollable-table";
import { useInvoiceStore } from "@/stores/invoice-store";
import { useSubscriptionStore } from "@/stores/subscription-store";
import { useWalletStore } from "@/stores/wallet-store";

import { formatAmount, amountToUsd, tokenLabel, type TokenType } from "@/lib/constants";
import { useLivePrices } from "@/stores/wallet-store";

interface PaymentRow {
  id: string;
  type: "invoice" | "subscription";
  label: string;
  amount: number;
  txId: string;
  timestamp: Date;
  tokenType: TokenType;
}

export default function CustomerPayments() {
  const { address } = useWalletStore();
  const invoices = useInvoiceStore((s) => s.invoices);
  const plans = useSubscriptionStore((s) => s.plans);
  const subscribers = useSubscriptionStore((s) => s.subscribers);
  const { btcPriceUsd, stxPriceUsd } = useLivePrices();

  const allPayments = useMemo(() => {
    const rows: PaymentRow[] = [];
    const wallet = address?.toLowerCase();

    // Invoice payments — only where connected wallet is the payer
    invoices.forEach((inv) => {
      if (wallet && inv.payerAddress?.toLowerCase() !== wallet) return;
      inv.payments.forEach((p) => {
        rows.push({
          id: `${inv.id}-${p.txId.slice(0, 8)}`,
          type: "invoice",
          label: inv.memo || `Invoice #${inv.id}`,
          amount: p.amount,
          txId: p.txId,
          timestamp: p.timestamp,
          tokenType: inv.tokenType,
        });
      });
    });

    // Subscription payments — only where connected wallet is the subscriber
    subscribers.forEach((sub) => {
      const plan = plans.find((p) => p.id === sub.planId);
      if (wallet && sub.payerAddress?.toLowerCase() !== wallet) return;
      const planName = plan?.name || sub.planId;
      sub.payments.forEach((p) => {
        rows.push({
          id: `${sub.id}-${p.txId.slice(0, 8)}`,
          type: "subscription",
          label: planName,
          amount: p.amount,
          txId: p.txId,
          timestamp: p.timestamp,
          tokenType: plan?.tokenType ?? 'sbtc',
        });
      });
    });

    return rows.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [invoices, subscribers, address]);

  return (
    <PageTransition className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-heading-lg text-foreground flex items-center gap-2">
          <Bitcoin className="h-6 w-6 text-primary" /> Payment History
        </h1>
        <p className="text-body-sm text-muted-foreground mt-1">
          All your invoice and subscription payments
        </p>
      </div>

      {allPayments.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-center">
          <Inbox className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <p className="text-body text-muted-foreground">No payments yet</p>
          <p className="text-body-sm text-muted-foreground mt-1 max-w-xs">
            When you pay an invoice or subscribe to a plan, your payment history will appear here.
          </p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ScrollableTable label="Payment history">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Description</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="hidden md:table-cell">TX ID</TableHead>
                    <TableHead className="hidden sm:table-cell">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allPayments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium text-foreground max-w-[120px] sm:max-w-[200px] truncate">{p.label}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={p.type === "invoice" ? "border-primary/30 text-primary" : "border-stacks/30 text-stacks"}>
                          {p.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono font-tabular">
                        <div>{formatAmount(p.amount, p.tokenType)} <span className="text-muted-foreground text-micro">{tokenLabel(p.tokenType)}</span></div>
                        <div className="text-micro text-muted-foreground">${amountToUsd(p.amount, p.tokenType, btcPriceUsd, stxPriceUsd)}</div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell font-mono text-caption text-muted-foreground">
                        {p.txId.slice(0, 10)}…
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-caption text-muted-foreground">
                        {format(p.timestamp, "MMM d, yyyy")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollableTable>
          </CardContent>
        </Card>
      )}
    </PageTransition>
  );
}
