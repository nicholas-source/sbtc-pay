import { useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { Copy, XCircle, ArrowDownLeft, ArrowUpRight, RotateCcw } from "lucide-react";
import type { Invoice } from "@/stores/invoice-store";
import { useInvoiceStore } from "@/stores/invoice-store";
import InvoiceStatusBadge from "./InvoiceStatusBadge";
import RefundDialog from "./RefundDialog";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";

import { BTC_USD } from "@/lib/constants";

interface Props {
  invoice: Invoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function InvoiceDetail({ invoice: invoiceProp, open, onOpenChange }: Props) {
  const cancelInvoice = useInvoiceStore((s) => s.cancelInvoice);
  const liveInvoice = useInvoiceStore((s) => invoiceProp ? s.invoices.find((i) => i.id === invoiceProp.id) : undefined);
  const [refundOpen, setRefundOpen] = useState(false);

  const invoice = liveInvoice ?? invoiceProp;
  if (!invoice) return null;

  const pct = invoice.amount > 0 ? Math.round((invoice.amountPaid / invoice.amount) * 100) : 0;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/pay/${invoice!.id}`);
      toast.success("Payment link copied");
    } catch {
      toast.error("Couldn't copy the link. Check your browser permissions.");
    }
  }

  function handleCancel() {
    cancelInvoice(invoice!.id);
    toast.success("Invoice cancelled");
    onOpenChange(false);
  }

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4">
          <div className="flex items-center gap-3">
            <SheetTitle className="font-mono text-xl">{invoice.id}</SheetTitle>
            <InvoiceStatusBadge status={invoice.status} />
          </div>
          <div className="flex gap-4 text-xs text-muted-foreground mt-1">
            <span>Created {formatDistanceToNow(invoice.createdAt, { addSuffix: true })}</span>
            <span>{invoice.expiresAt ? `Expires ${formatDistanceToNow(invoice.expiresAt, { addSuffix: true })}` : "No expiration"}</span>
          </div>
        </SheetHeader>

        <div className="space-y-6">
          {/* Amount */}
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground mb-1">Total Amount</p>
            <p className="text-2xl font-mono font-bold font-tabular">{invoice.amount.toLocaleString()} <span className="text-sm text-muted-foreground">sats</span></p>
            <p className="text-sm text-muted-foreground">${(invoice.amount * BTC_USD).toFixed(2)} USD</p>
          </div>

          {/* Partial progress */}
          {(invoice.status === "partial" || invoice.amountPaid > 0) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Payment progress</span>
                <span className="font-mono font-tabular">{pct}%</span>
              </div>
              <Progress value={pct} className="h-2" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{invoice.amountPaid.toLocaleString()} paid</span>
                <span>{(invoice.amount - invoice.amountPaid).toLocaleString()} remaining</span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={copyLink} className="flex-1">
              <Copy className="mr-2 h-3.5 w-3.5" />Copy link
            </Button>
            {invoice.status === "pending" && (
              <Button variant="destructive" size="sm" onClick={handleCancel} className="flex-1" aria-label={`Cancel invoice ${invoice.id}`}>
                <XCircle className="mr-2 h-3.5 w-3.5" />Cancel Invoice
              </Button>
            )}
            {invoice.amountPaid > 0 && (invoice.status === "paid" || invoice.status === "partial") && (
              <Button variant="outline" size="sm" onClick={() => setRefundOpen(true)} className="flex-1">
                <RotateCcw className="mr-2 h-3.5 w-3.5" />Refund
              </Button>
            )}
          </div>

          <Separator />

          {/* Payment history */}
          <div>
            <h4 className="text-sm font-medium mb-3">Payment History</h4>
            {invoice.payments.length === 0 ? (
              <p className="text-xs text-muted-foreground">No payments yet</p>
            ) : (
              <div className="space-y-3">
                {invoice.payments.map((p, i) => (
                  <div key={i} className="flex items-start gap-3 text-sm">
                    <div className="mt-0.5 rounded-full bg-success/10 p-1.5">
                      <ArrowDownLeft className="h-3 w-3 text-success" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-tabular">+{p.amount.toLocaleString()} sats</span>
                        <span className="text-xs text-muted-foreground">{format(p.timestamp, "MMM d, HH:mm")}</span>
                      </div>
                      <p className="text-xs text-muted-foreground font-mono truncate mt-0.5">{p.txId}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Refund history */}
          {invoice.refunds.length > 0 && (
            <>
              <Separator />
              <div>
                <h4 className="text-sm font-medium mb-3">Refunds</h4>
                <div className="space-y-3">
                  {invoice.refunds.map((r, i) => (
                    <div key={i} className="flex items-start gap-3 text-sm">
                      <div className="mt-0.5 rounded-full bg-destructive/10 p-1.5">
                        <ArrowUpRight className="h-3 w-3 text-destructive" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-tabular">-{r.amount.toLocaleString()} sats</span>
                          <span className="text-xs text-muted-foreground">{format(r.timestamp, "MMM d, HH:mm")}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{r.reason}</p>
                        <p className="text-xs text-muted-foreground font-mono truncate mt-0.5">{r.txId}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          <Separator />

          {/* Info */}
          <div className="space-y-2 text-xs">
            {invoice.memo && <div className="flex gap-1"><span className="text-muted-foreground shrink-0">Memo:</span> <span className="break-words line-clamp-3">{invoice.memo}</span></div>}
            {invoice.referenceId && <div className="flex gap-1 min-w-0"><span className="text-muted-foreground shrink-0">Reference:</span> <span className="font-mono truncate">{invoice.referenceId}</span></div>}
            <div className="flex gap-1 min-w-0"><span className="text-muted-foreground shrink-0">Merchant:</span> <span className="font-mono truncate">{invoice.merchantAddress}</span></div>
            {invoice.payerAddress && <div className="flex gap-1 min-w-0"><span className="text-muted-foreground shrink-0">Payer:</span> <span className="font-mono truncate">{invoice.payerAddress}</span></div>}
            <div className="flex gap-4">
              {invoice.allowPartial && <span className="text-muted-foreground">✓ Partial payments</span>}
              {invoice.allowOverpay && <span className="text-muted-foreground">✓ Accepts overpayments</span>}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
    {invoice && refundOpen && (
      <RefundDialog invoice={invoice} open={refundOpen} onOpenChange={setRefundOpen} />
    )}
    </>
  );
}
