import { useState, useMemo, useRef, useEffect } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { PageTransition } from "@/components/layout/PageTransition";
import { Wallet, AlertTriangle, Bitcoin, Copy, Check, Loader2 } from "lucide-react";
import { useInvoiceStore, type Payment } from "@/stores/invoice-store";
import { useWalletStore } from "@/stores/wallet-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { PaymentQRCode } from "@/components/pay/PaymentQRCode";
import { ExpirationCountdown } from "@/components/pay/ExpirationCountdown";
import { PaymentConfirmation } from "@/components/pay/PaymentConfirmation";
import { toast } from "sonner";
import { payInvoice, getInvoice as getBlockchainInvoice, waitForTransaction } from "@/lib/stacks/contract";
import { formatSats as formatSatsUtil, truncateAddress, NETWORK_MODE } from "@/lib/stacks/config";

import { SATS_PER_BTC, BTC_USD_PRICE } from "@/lib/constants";

function formatSats(sats: number) {
  return sats.toLocaleString();
}

function PaymentPage() {
  const { invoiceId } = useParams();
  const invoice = useInvoiceStore((s) => s.invoices.find((i) => i.id === invoiceId));
  const simulatePayment = useInvoiceStore((s) => s.simulatePayment);
  const { isConnected, isConnecting, address, sbtcBalance, connect, connectionError, clearError } = useWalletStore();

  const [paymentState, setPaymentState] = useState<"idle" | "confirming" | "confirmed" | "error">("idle");
  const [completedPayment, setCompletedPayment] = useState<Payment | null>(null);
  const [payAmount, setPayAmount] = useState<string>("");
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [txId, setTxId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const confirmedAmount = useRef<number>(0);

  // Check if this is a blockchain invoice (numeric ID)
  const isBlockchainInvoice = invoiceId && /^\d+$/.test(invoiceId);
  const blockchainInvoiceId = isBlockchainInvoice ? parseInt(invoiceId, 10) : null;

  const remaining = useMemo(() => {
    if (!invoice) return 0;
    return invoice.amount - invoice.amountPaid;
  }, [invoice]);

  // Initialize pay amount when invoice loads
  const effectivePayAmount = useMemo(() => {
    if (!invoice) return 0;
    if (invoice.allowPartial && payAmount !== "") {
      const val = parseInt(payAmount, 10);
      if (!isNaN(val) && val > 0) return Math.min(val, remaining);
    }
    return remaining;
  }, [invoice, payAmount, remaining]);

  const handlePay = async () => {
    if (!invoice || effectivePayAmount <= 0) return;
    confirmedAmount.current = effectivePayAmount;
    setPaymentState("confirming");
    setErrorMessage(null);

    try {
      if (isBlockchainInvoice && blockchainInvoiceId !== null && address) {
        // Real blockchain payment
        toast.info("Please confirm the transaction in your wallet...");
        
        const result = await payInvoice(
          blockchainInvoiceId,
          BigInt(effectivePayAmount),
          address
        );

        if (result.txId) {
          setTxId(result.txId);
          toast.success("Transaction submitted! Waiting for confirmation...");
          
          // Wait for transaction confirmation
          try {
            await waitForTransaction(result.txId);
            toast.success("Payment confirmed!");
          } catch {
            // Transaction may still be pending, that's ok
            toast.info("Transaction submitted. Check back soon for confirmation.");
          }
        }

        setCompletedPayment({
          timestamp: new Date(),
          amount: effectivePayAmount,
          txId: result.txId || 'pending',
        });
        setPaymentState("confirmed");
      } else {
        // Mock payment for demo invoices
        await new Promise((r) => setTimeout(r, 2000));
        const payment = simulatePayment(invoice.id, effectivePayAmount);
        setCompletedPayment(payment);
        setPaymentState("confirmed");
      }
    } catch (error) {
      console.error("Payment failed:", error);
      setErrorMessage(error instanceof Error ? error.message : "Payment failed");
      setPaymentState("error");
      toast.error("Payment failed. Please try again.");
    }
  };

  // --- Not Found ---
  if (!invoice) {
    return (
      <PageShell>
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <AlertTriangle className="h-12 w-12 text-muted-foreground" />
          <h1 className="text-heading-sm text-foreground">Invoice Not Found</h1>
          <p className="text-body-sm text-muted-foreground max-w-xs">
            The invoice <code className="text-primary">{invoiceId}</code> doesn't exist or has been removed.
          </p>
        </div>
      </PageShell>
    );
  }

  // --- Expired / Cancelled ---
  if (invoice.status === "expired" || invoice.status === "cancelled") {
    return (
      <PageShell>
        <InvoiceHeader invoice={invoice} />
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <AlertTriangle className="h-12 w-12 text-destructive" />
          <p className="text-heading-sm text-foreground">
            {invoice.status === "expired" ? "Invoice Expired" : "Invoice Cancelled"}
          </p>
          <p className="text-body-sm text-muted-foreground">
            This invoice is no longer payable.
          </p>
        </div>
      </PageShell>
    );
  }

  // --- Already Paid (and not currently in our payment flow) ---
  if (invoice.status === "paid" && paymentState === "idle") {
    return (
      <PageShell>
        <InvoiceHeader invoice={invoice} />
        <PaymentConfirmation
          payment={invoice.payments[invoice.payments.length - 1] ?? null}
          amount={invoice.amountPaid}
        />
      </PageShell>
    );
  }

  // --- Confirming / Confirmed (our flow) ---
  if (paymentState === "confirming" || paymentState === "confirmed") {
    return (
      <PageShell>
        <InvoiceHeader invoice={invoice} />
        <PaymentConfirmation payment={completedPayment} amount={confirmedAmount.current} />
      </PageShell>
    );
  }

  // --- Error State ---
  if (paymentState === "error") {
    return (
      <PageShell>
        <InvoiceHeader invoice={invoice} />
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <AlertTriangle className="h-12 w-12 text-destructive" />
          <p className="text-heading-sm text-foreground">Payment Failed</p>
          <p className="text-body-sm text-muted-foreground max-w-xs">
            {errorMessage || "An error occurred while processing your payment."}
          </p>
          <Button
            variant="outline"
            onClick={() => {
              setPaymentState("idle");
              setErrorMessage(null);
            }}
          >
            Try Again
          </Button>
        </div>
      </PageShell>
    );
  }

  // --- Awaiting Payment ---
  const paidPercent = invoice.amount > 0 ? Math.round((invoice.amountPaid / invoice.amount) * 100) : 0;
  const usdAmount = (remaining / SATS_PER_BTC) * BTC_USD_PRICE;
  const feeSats = Math.round(remaining * 0.005); // 0.5% fee
  const merchantReceives = remaining - feeSats;
  // sbtcBalance is in sats (bigint), convert to number for comparison
  const walletBalanceSats = Number(sbtcBalance);
  const hasSufficient = isConnected && walletBalanceSats >= remaining;

  return (
    <PageShell>
      <InvoiceHeader invoice={invoice} />

      <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-8">
        <PaymentQRCode address={invoice.merchantAddress} />

        <div className="flex flex-col gap-1 text-center sm:text-left">
          <span className="text-caption text-muted-foreground uppercase tracking-wider">Amount Due</span>
          <span className="text-sats text-gradient-orange font-tabular">
            {formatSats(remaining)} sats
          </span>
          <span className="text-body-sm text-muted-foreground">
            ~${usdAmount.toFixed(2)} USD
          </span>
        </div>
      </div>

      <Separator className="bg-border" />

      {/* Fee Breakdown */}
      <div className="space-y-2 rounded-lg bg-muted p-3">
        <p className="text-caption font-medium text-muted-foreground uppercase tracking-wider">Fee Breakdown</p>
        <div className="flex justify-between text-body-sm">
          <span className="text-muted-foreground">Amount</span>
          <span className="text-foreground font-tabular">{formatSats(remaining)} sats</span>
        </div>
        <div className="flex justify-between text-body-sm">
          <span className="text-muted-foreground">Fee (0.5%)</span>
          <span className="text-foreground font-tabular">{formatSats(feeSats)} sats</span>
        </div>
        <Separator className="bg-border" />
        <div className="flex justify-between text-body-sm font-medium">
          <span className="text-muted-foreground">Merchant receives</span>
          <span className="text-foreground font-tabular">{formatSats(merchantReceives)} sats</span>
        </div>
      </div>

      {/* Balance Check */}
      {isConnected && (
        <div className={`flex items-center justify-between rounded-lg p-3 text-body-sm ${hasSufficient ? "bg-success/10 border border-success/30" : "bg-destructive/10 border border-destructive/30"}`}>
          <span className="text-muted-foreground">Your sBTC:</span>
          <span className={`font-tabular ${hasSufficient ? "text-success" : "text-destructive"}`}>
            {formatSats(walletBalanceSats)} sats — {hasSufficient ? "Sufficient" : "Insufficient"}
          </span>
        </div>
      )}

      {/* Details */}
      <div className="space-y-3">
        <div className="flex justify-between text-body-sm">
          <span className="text-muted-foreground">Merchant</span>
          <span className="text-foreground font-mono text-caption">
            {truncateAddress(invoice.merchantAddress)}
          </span>
        </div>

        {invoice.expiresAt && (
          <div className="flex justify-between items-center text-body-sm">
            <span className="text-muted-foreground">Expires in</span>
            <ExpirationCountdown expiresAt={invoice.expiresAt} />
          </div>
        )}

        {invoice.amountPaid > 0 && (
          <div className="space-y-2">
            <div className="flex justify-between text-body-sm">
              <span className="text-muted-foreground">Paid</span>
              <span className="text-foreground">{paidPercent}%</span>
            </div>
            <Progress value={paidPercent} className="h-2" />
          </div>
        )}
      </div>

      <Separator className="bg-border" />

      {/* Payment action */}
      <div className="space-y-4">
        {invoice.allowPartial && (
          <div className="space-y-2">
            <label className="text-caption text-muted-foreground">Payment amount (sats)</label>
            <Input
              type="number"
              min={1}
              max={remaining}
              placeholder={formatSats(remaining)}
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              className="font-tabular"
            />
          </div>
        )}

        {!isConnected ? (
          <div className="space-y-3">
            {/* Testnet warning */}
            <div className="flex items-center justify-center gap-2 p-2 rounded-lg bg-orange-500/10 border border-orange-500/30">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-500" />
              </span>
              <span className="text-caption text-orange-500">Testnet Mode - Switch wallet to Testnet before connecting</span>
            </div>
            <Button
              disabled={isConnecting}
              className="w-full h-12 text-body font-semibold gap-2"
              onClick={async () => {
                clearError();
                await connect();
                const state = useWalletStore.getState();
                if (state.isConnected && !state.connectionError) {
                  toast.success("Wallet connected!");
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
              }}
            >
              {isConnecting ? (
                <><Loader2 className="h-5 w-5 animate-spin" />Connecting...</>
              ) : (
                <><Wallet className="h-5 w-5" />Connect Wallet & Pay</>
              )}
            </Button>
          </div>
        ) : (
          <Button
            className="w-full h-12 text-body font-semibold gap-2"
            onClick={handlePay}
          >
            <Bitcoin className="h-5 w-5" />
            Pay {formatSats(effectivePayAmount)} sats
          </Button>
        )}

        {isConnected && address && (
          <p className="text-caption text-muted-foreground text-center">
            Connected: {truncateAddress(address)}
          </p>
        )}
      </div>

      {/* Manual pay */}
      <div className="relative">
        <Separator className="bg-border" />
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-3 text-caption text-muted-foreground">
          or pay manually
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-caption text-muted-foreground shrink-0">Address:</span>
        <code className="flex-1 truncate text-caption text-foreground font-mono">
          {invoice.merchantAddress}
        </code>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 h-8 w-8"
          onClick={async () => {
            await navigator.clipboard.writeText(invoice.merchantAddress);
            setCopiedAddress(true);
            toast.success("Address copied to clipboard");
            setTimeout(() => setCopiedAddress(false), 2000);
          }}
        >
          {copiedAddress ? (
            <Check className="h-4 w-4 text-success" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
      </div>
  </PageShell>
  );
}
export default PaymentPage;

// --- Shell & Header sub-components ---

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <PageTransition>
      <div className="flex min-h-screen items-center justify-center bg-background p-4 bg-grid">
        <Card className="w-full max-w-md card-glow border-border">
          <CardContent className="p-6 sm:p-8 space-y-6">
            {/* Branding */}
            <div className="flex items-center justify-center gap-2">
              <Bitcoin className="h-6 w-6 text-primary" />
              <span className="text-heading-sm text-gradient-orange">sBTC Pay</span>
              <Badge
                variant="outline"
                className="ml-2 border-stacks text-stacks text-caption"
              >
                Testnet
              </Badge>
            </div>

            {children}
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}

function InvoiceHeader({ invoice }: { invoice: { id: string; memo: string } }) {
  return (
    <div className="text-center space-y-1">
      <h1 className="text-heading-sm text-foreground">Invoice #{invoice.id}</h1>
      {invoice.memo && (
        <p className="text-body-sm text-muted-foreground italic">"{invoice.memo}"</p>
      )}
    </div>
  );
}
