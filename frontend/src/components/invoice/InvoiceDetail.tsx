import { useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { Copy, XCircle, ArrowDownLeft, ArrowUpRight, RotateCcw, Pencil } from "lucide-react";
import type { Invoice } from "@/stores/invoice-store";
import { useInvoiceStore } from "@/stores/invoice-store";
import InvoiceStatusBadge from "./InvoiceStatusBadge";
import RefundDialog from "./RefundDialog";
import EditInvoiceDialog from "./EditInvoiceDialog";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import { formatAmount, amountToUsd, tokenLabel } from "@/lib/constants";
import { getExplorerTxUrl, truncateAddress } from "@/lib/stacks/config";
import { useLivePrices } from "@/stores/wallet-store";

interface Props {
  invoice: Invoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function InvoiceDetail({ invoice: invoiceProp, open, onOpenChange }: Props) {
  const cancelInvoice = useInvoiceStore((s) => s.cancelInvoice);
  const liveInvoice = useInvoiceStore((s) => invoiceProp ? s.invoices.find((i) => i.id === invoiceProp.id) : undefined);
  const [refundOpen, setRefundOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const { btcPriceUsd, stxPriceUsd } = useLivePrices();

  const invoice = liveInvoice ?? invoiceProp;
  if (!invoice) return null;

  const pct = invoice.amount > 0 ? Math.round((invoice.amountPaid / invoice.amount) * 100) : 0;

  const canEdit = invoice.status === "pending" && invoice.amountPaid === 0 && invoice.dbId > 0;

  async function copyLink() {
    if (invoice!.dbId === 0) {
      toast.warning("Payment link not ready yet", {
        description: "This invoice is still confirming on-chain. Try again in a few minutes.",
      });
      return;
    }
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/pay/${invoice!.dbId}`);
      toast.success("Payment link copied");
    } catch {
      toast.error("Couldn't copy the link. Check your browser permissions.");
    }
  }

  async function handleCancel() {
    try {
      await cancelInvoice(invoice!.id);
      toast.success("Invoice cancelled");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to cancel invoice");
    }
  }

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="max-w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4">
          <div className="flex items-center gap-3">
            <SheetTitle className="font-mono text-heading-sm">{invoice.id}</SheetTitle>
            <InvoiceStatusBadge status={invoice.status} amountPaid={invoice.amountPaid} />
          </div>
          <div className="flex gap-4 text-xs text-muted-foreground mt-1">
            <span>Created {formatDistanceToNow(invoice.createdAt, { addSuffix: true })}</span>
            <span>{invoice.status === "expired" ? "Expired" : invoice.expiresAt ? `Expires ${formatDistanceToNow(invoice.expiresAt, { addSuffix: true })}` : "No expiration"}</span>
          </div>
        </SheetHeader>

        <div className="space-y-6">
          {/* Amount */}
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground mb-1">Total Amount</p>
            <p className="text-heading font-mono font-bold font-tabular">{formatAmount(invoice.amount, invoice.tokenType)} <span className="text-sm text-muted-foreground">{tokenLabel(invoice.tokenType)}</span></p>
            <p className="text-sm text-muted-foreground">${amountToUsd(invoice.amount, invoice.tokenType, btcPriceUsd, stxPriceUsd)} USD</p>
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
                <span>{formatAmount(invoice.amountPaid, invoice.tokenType)} paid</span>
                <span>{formatAmount(Math.max(0, invoice.amount - invoice.amountPaid), invoice.tokenType)} remaining</span>
              </div>
              {/* Refund summary */}
              {invoice.refunds.length > 0 && (() => {
                const totalRefunded = invoice.refunds.reduce((sum, r) => sum + r.amount, 0);
                return (
                  <div className="flex justify-between text-xs text-destructive/80">
                    <span>{formatAmount(totalRefunded, invoice.tokenType)} refunded</span>
                    <span>Net: {formatAmount(Math.max(0, invoice.amountPaid - totalRefunded), invoice.tokenType)}</span>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Optimistic invoice banner */}
          {invoice.dbId === 0 && (
            <div className="rounded-md bg-warning/10 border border-warning/30 px-3 py-2 text-xs text-warning">
              ⏳ Confirming on-chain… Payment link will be available once confirmed.
            </div>
          )}

          {/* Expired with partial payment banner */}
          {invoice.status === "expired" && invoice.amountPaid > 0 && (
            <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-xs text-destructive">
              This invoice expired with {formatAmount(invoice.amountPaid, invoice.tokenType)} {tokenLabel(invoice.tokenType)} received ({pct}% of total). Consider issuing a refund to the payer.
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={copyLink} className="flex-1" disabled={invoice.dbId === 0}>
              <Copy className="mr-2 h-3.5 w-3.5" />{invoice.dbId === 0 ? "Pending…" : "Copy link"}
            </Button>
            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="flex-1">
                <Pencil className="mr-2 h-3.5 w-3.5" />Edit
              </Button>
            )}
            {invoice.status === "pending" && invoice.dbId > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" className="flex-1" aria-label={`Cancel invoice ${invoice.id}`}>
                    <XCircle className="mr-2 h-3.5 w-3.5" />Cancel Invoice
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancel Invoice {invoice.id}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will cancel the invoice for {formatAmount(invoice.amount, invoice.tokenType)} {tokenLabel(invoice.tokenType)}.
                      This action requires an on-chain transaction and cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep Invoice</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={handleCancel}
                    >
                      Cancel Invoice
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {invoice.amountPaid > 0 && (invoice.status === "paid" || invoice.status === "partial" || invoice.status === "expired") && (() => {
              const uniquePayers = Array.from(new Set(invoice.payments.map((p) => p.payer).filter(Boolean)));
              const hasMultiplePayers = uniquePayers.length > 1;
              return hasMultiplePayers ? (
                <div className="flex-1">
                  <Button variant="outline" size="sm" disabled className="w-full opacity-50">
                    <RotateCcw className="mr-2 h-3.5 w-3.5" />Refund
                  </Button>
                  <p className="text-[10px] text-destructive mt-1 text-center">
                    Multiple payers detected — on-chain refund would only go to the last payer. Contact payers directly.
                  </p>
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setRefundOpen(true)} className="flex-1">
                  <RotateCcw className="mr-2 h-3.5 w-3.5" />Refund
                </Button>
              );
            })()}
          </div>

          <Separator />

          {/* Transaction history — unified timeline of payments and refunds */}
          <div>
            <h4 className="text-sm font-medium mb-3">Transaction History</h4>
            {invoice.payments.length === 0 && invoice.refunds.length === 0 ? (
              <p className="text-xs text-muted-foreground">No transactions yet</p>
            ) : (
              <div className="space-y-3">
                {[
                  ...invoice.payments.map((p, idx) => ({
                    type: "payment" as const,
                    timestamp: p.timestamp,
                    amount: p.amount,
                    txId: p.txId,
                    payer: p.payer,
                    reason: "",
                    key: p.txId || `pay-${idx}`,
                  })),
                  ...invoice.refunds.map((r, idx) => ({
                    type: "refund" as const,
                    timestamp: r.timestamp,
                    amount: r.amount,
                    txId: r.txId,
                    payer: "",
                    reason: r.reason,
                    key: r.txId || `ref-${idx}`,
                  })),
                ]
                  .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
                  .map((entry) =>
                    entry.type === "payment" ? (
                      <div key={entry.key} className="flex items-start gap-3 text-sm">
                        <div className="mt-0.5 rounded-full bg-success/10 p-1.5">
                          <ArrowDownLeft className="h-3 w-3 text-success" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-tabular text-success">+{formatAmount(entry.amount, invoice.tokenType)} {tokenLabel(invoice.tokenType)}</span>
                            <span className="text-xs text-muted-foreground">{format(entry.timestamp, "MMM d, HH:mm")}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">Payment received</p>
                          {entry.payer && (
                            <p className="text-xs text-muted-foreground font-mono truncate mt-0.5">
                              From: {truncateAddress(entry.payer)}
                            </p>
                          )}
                          {entry.txId ? (
                            <a
                              href={getExplorerTxUrl(entry.txId)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary font-mono truncate mt-0.5 block hover:underline"
                            >
                              Tx: {truncateAddress(entry.txId)}
                            </a>
                          ) : (
                            <p className="text-xs text-success mt-0.5 font-medium">✓ Confirmed</p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div key={entry.key} className="flex items-start gap-3 text-sm">
                        <div className="mt-0.5 rounded-full bg-destructive/10 p-1.5">
                          <ArrowUpRight className="h-3 w-3 text-destructive" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-tabular text-destructive">-{formatAmount(entry.amount, invoice.tokenType)} {tokenLabel(invoice.tokenType)}</span>
                            <span className="text-xs text-muted-foreground">{format(entry.timestamp, "MMM d, HH:mm")}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Refund{entry.reason ? `: ${entry.reason}` : ""}
                          </p>
                          {entry.txId ? (
                            <a
                              href={getExplorerTxUrl(entry.txId)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary font-mono truncate mt-0.5 block hover:underline"
                            >
                              Tx: {truncateAddress(entry.txId)}
                            </a>
                          ) : (
                            <p className="text-xs text-success mt-0.5 font-medium">✓ Confirmed</p>
                          )}
                        </div>
                      </div>
                    ),
                  )}
              </div>
            )}
          </div>

          <Separator />

          {/* Info */}
          <div className="space-y-2 text-xs">
            {invoice.memo && <div className="flex gap-1"><span className="text-muted-foreground shrink-0">Memo:</span> <span className="break-words line-clamp-3">{invoice.memo}</span></div>}
            {invoice.referenceId && <div className="flex gap-1 min-w-0"><span className="text-muted-foreground shrink-0">Reference:</span> <span className="font-mono truncate">{invoice.referenceId}</span></div>}
            <div className="flex gap-1 min-w-0"><span className="text-muted-foreground shrink-0">Merchant:</span> <span className="font-mono truncate">{invoice.merchantAddress}</span></div>
            {(() => {
              const payers = Array.from(new Set(
                [invoice.payerAddress, ...invoice.payments.map((p) => p.payer)].filter(Boolean)
              ));
              if (payers.length === 0) return null;
              if (payers.length === 1) {
                return <div className="flex gap-1 min-w-0"><span className="text-muted-foreground shrink-0">Payer:</span> <span className="font-mono truncate">{payers[0]}</span></div>;
              }
              return (
                <div className="space-y-1">
                  <span className="text-muted-foreground">Payers ({payers.length}):</span>
                  {payers.map((p) => (
                    <div key={p} className="flex gap-1 min-w-0 pl-2">
                      <span className="font-mono truncate">{p}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
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
    {invoice && editOpen && (
      <EditInvoiceDialog invoice={invoice} open={editOpen} onOpenChange={setEditOpen} />
    )}
    </>
  );
}
