import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Bitcoin, AlertTriangle, Wallet, Loader2, Check } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useInvoiceStore, STATUS_MAP, type Invoice } from "@/stores/invoice-store";
import { ExpirationCountdown } from "@/components/pay/ExpirationCountdown";
import { toast } from "sonner";
import { PageTransition } from "@/components/layout/PageTransition";
import { formatSbtc } from "@/lib/constants";
import { useWalletStore, useSatsToUsd } from "@/stores/wallet-store";
import { payInvoice, getInvoice as getInvoiceOnChain, CONTRACT_ERRORS } from "@/lib/stacks/contract";
import { PAYMENT_CONTRACT, getExplorerTxUrl } from "@/lib/stacks/config";

export default function InvoicePaymentWidget() {
  const { invoiceId } = useParams();
  const storeInvoice = useInvoiceStore((s) => s.invoices.find((i) => i.id === invoiceId || i.dbId.toString() === invoiceId));

  const { isConnected, address, connect } = useWalletStore();
  const satsToUsd = useSatsToUsd();
  const [remoteInvoice, setRemoteInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(false);
  const [payState, setPayState] = useState<"idle" | "confirming" | "confirmed" | "error">("idle");
  const [txId, setTxId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch from on-chain if not in local store
  useEffect(() => {
    if (storeInvoice || !invoiceId) return;
    const numericId = parseInt(invoiceId, 10);
    if (isNaN(numericId)) return;

    setLoading(true);
    const senderAddr = address || PAYMENT_CONTRACT.address;
    getInvoiceOnChain(numericId, senderAddr).then((onChain) => {
      if (!onChain) { setLoading(false); return; }
      setRemoteInvoice({
        id: `INV-${numericId}`,
        dbId: numericId,
        amount: Number(onChain.amount),
        amountPaid: Number(onChain.amountPaid),
        memo: onChain.memo || "",
        referenceId: onChain.referenceId || "",
        status: STATUS_MAP[onChain.status] ?? "pending",
        allowPartial: onChain.allowPartial,
        allowOverpay: onChain.allowOverpay,
        merchantAddress: onChain.merchant,
        payerAddress: onChain.payer || "",
        createdAt: new Date(),
        expiresAt: null,
        payments: [],
        refunds: [],
      });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [invoiceId, storeInvoice, address]);

  const invoice = storeInvoice || remoteInvoice;

  const handlePay = useCallback(async () => {
    if (!invoice || payState !== "idle") return;
    const remaining = invoice.amount - invoice.amountPaid;
    if (remaining <= 0) return;

    if (!isConnected || !address) {
      toast.info("Connect your wallet first");
      connect();
      return;
    }

    if (address === PAYMENT_CONTRACT.address) {
      toast.error("Fee-recipient wallet cannot make payments");
      return;
    }

    setPayState("confirming");
    setErrorMsg(null);

    try {
      toast.info("Please confirm the transaction in your wallet");
      const result = await payInvoice({
        invoiceId: invoice.dbId,
        amount: BigInt(remaining),
        payerAddress: address,
      });

      if (result.txId) {
        setTxId(result.txId);
        setPayState("confirmed");
        toast.success("Payment submitted!");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Payment failed";
      const errNum = msg.match(/u(\d{4})/)?.[1];
      const readable = errNum ? CONTRACT_ERRORS[Number(errNum)] : null;
      setErrorMsg(readable || msg);
      setPayState("error");
      toast.error(readable || msg);
    }
  }, [invoice, payState, isConnected, address, connect]);

  if (loading) {
    return (
      <WidgetShell>
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
        <p className="text-center text-body-sm text-muted-foreground">Loading invoice...</p>
      </WidgetShell>
    );
  }

  if (!invoice) {
    return (
      <WidgetShell>
        <AlertTriangle className="h-10 w-10 text-muted-foreground mx-auto" />
        <p className="text-center text-body-sm text-muted-foreground">Invoice not found</p>
      </WidgetShell>
    );
  }

  const remaining = invoice.amount - invoice.amountPaid;
  const paidPct = invoice.amount > 0 ? Math.round((invoice.amountPaid / invoice.amount) * 100) : 0;

  if (payState === "confirmed" && txId) {
    return (
      <WidgetShell>
        <Check className="h-12 w-12 text-success mx-auto" />
        <p className="text-center text-heading-sm text-foreground">Payment Submitted</p>
        <p className="text-center text-body-sm text-muted-foreground">
          {formatSbtc(remaining)} sBTC for Invoice #{invoice.id}
        </p>
        <a href={getExplorerTxUrl(txId)} target="_blank" rel="noopener noreferrer"
          className="text-primary text-body-sm underline text-center block">
          View transaction →
        </a>
      </WidgetShell>
    );
  }

  if (invoice.status === "paid") {
    return (
      <WidgetShell>
        <p className="text-center text-heading-sm text-success">✓ Paid</p>
        <p className="text-center text-sats text-primary font-tabular">{formatSbtc(invoice.amountPaid)} sBTC</p>
        <p className="text-center text-caption text-muted-foreground">≈ ${satsToUsd(invoice.amountPaid)} USD</p>
      </WidgetShell>
    );
  }

  if (invoice.status === "expired" || invoice.status === "cancelled") {
    return (
      <WidgetShell>
        <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
        <p className="text-center text-body-sm text-muted-foreground">Invoice {invoice.status}</p>
      </WidgetShell>
    );
  }

  return (
    <WidgetShell>
      <div className="text-center">
        <p className="text-caption text-muted-foreground">Invoice #{invoice.id}</p>
        {invoice.memo && <p className="text-caption text-muted-foreground italic">"{invoice.memo}"</p>}
      </div>

      <div className="flex justify-center">
        <div className="rounded-lg bg-white p-3">
          <QRCodeSVG value={invoice.merchantAddress} size={120} level="M" />
        </div>
      </div>

      <div className="text-center">
        <span className="text-2xl sm:text-sats text-primary font-tabular">{formatSbtc(remaining)} sBTC</span>
        <p className="text-caption text-muted-foreground">≈ ${satsToUsd(remaining)} USD</p>
      </div>

      {invoice.amountPaid > 0 && <Progress value={paidPct} className="h-2" />}

      {invoice.expiresAt && (
        <div className="flex justify-center">
          <ExpirationCountdown expiresAt={invoice.expiresAt} />
        </div>
      )}

      {errorMsg && (
        <p className="text-body-sm text-destructive text-center">{errorMsg}</p>
      )}

      {!isConnected ? (
        <Button className="w-full h-10 gap-2 font-semibold" onClick={() => connect()}>
          <Wallet className="h-4 w-4" /> Connect Wallet
        </Button>
      ) : (
        <Button
          className="w-full h-10 gap-2 font-semibold"
          onClick={handlePay}
          disabled={payState === "confirming"}
        >
          {payState === "confirming" ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Confirming...</>
          ) : (
            <><Wallet className="h-4 w-4" /> Pay {formatSbtc(remaining)} sBTC</>
          )}
        </Button>
      )}

      {isConnected && address && (
        <p className="text-[10px] text-muted-foreground text-center">
          Connected: <code className="font-mono">{address.slice(0, 6)}…{address.slice(-4)}</code>
        </p>
      )}
    </WidgetShell>
  );
}

function WidgetShell({ children }: { children: React.ReactNode }) {
  return (
    <PageTransition>
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <Card className="w-full max-w-xs border-border">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-center gap-2">
              <Bitcoin className="h-4 w-4 text-primary" />
              <span className="text-body font-bold text-primary">sBTC Pay</span>
              <Badge variant="outline" className="text-[10px] border-stacks text-stacks">Widget</Badge>
            </div>
            {children}
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}
