import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { PageTransition } from "@/components/layout/PageTransition";
import { Wallet, AlertTriangle, Bitcoin, Copy, Check, Loader2, RefreshCw } from "lucide-react";
import { useInvoiceStore, STATUS_MAP, type Payment, type Invoice } from "@/stores/invoice-store";
import { useWalletStore } from "@/stores/wallet-store";
import { supabase, supabaseWithWallet } from "@/lib/supabase/client";
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
import { payInvoice, getInvoice as getInvoiceOnChain, getContractConfig, CONTRACT_ERRORS, waitForTransaction, fetchPaymentEventsForInvoice } from "@/lib/stacks/contract";
import { truncateAddress, NETWORK_MODE, PAYMENT_CONTRACT, fetchBurnBlockHeight, fetchBurnBlockTimestamp, getExplorerTxUrl, type TokenType, TOKEN_DECIMALS } from "@/lib/stacks/config";

import { formatAmount, humanToBaseUnits, baseToHuman, tokenLabel, amountToUsd } from "@/lib/constants";
import { useBtcPrice, useStxPrice } from "@/stores/wallet-store";
import { PriceStatusBadge } from "@/components/pay/PriceStatusBadge";

function PaymentPage() {
  const { invoiceId } = useParams();
  const btcPriceUsd = useBtcPrice();
  const stxPriceUsd = useStxPrice();
  // Try local store first (merchant viewing their own invoice)
  const storeInvoice = useInvoiceStore((s) => s.invoices.find((i) => i.id === invoiceId || i.dbId.toString() === invoiceId));
  const addConfirmedPayment = useInvoiceStore((s) => s.addConfirmedPayment);
  const { isConnected, isConnecting, address, sbtcBalance, stxBalance, balancesLoading, connect, connectionError, clearError, fetchBalances } = useWalletStore();

  const [remoteInvoice, setRemoteInvoice] = useState<Invoice | null>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [feeBps, setFeeBps] = useState<number>(50); // default 0.5%, updated from chain

  // Fetch actual fee BPS from contract config
  useEffect(() => {
    const senderAddr = address || PAYMENT_CONTRACT.address;
    getContractConfig(senderAddr).then((cfg) => {
      if (cfg) setFeeBps(cfg.platformFeeBps);
    }).catch(() => { /* keep default */ });
  }, [address]);

  // If not in local store, fetch from on-chain (customer visiting pay link)
  useEffect(() => {
    if (storeInvoice || !invoiceId) return;
    const numericId = parseInt(invoiceId, 10);
    if (isNaN(numericId)) {
      // Non-numeric ID (e.g. INV-U7FD) = optimistic invoice link. Not yet on-chain.
      setInvoiceLoading(false);
      return;
    }

    setInvoiceLoading(true);
    (async () => {
      // Read invoice from on-chain (source of truth for amount, status, etc.)
      const senderAddr = address || PAYMENT_CONTRACT.address;
      const onChain = await getInvoiceOnChain(numericId, senderAddr);

      if (!onChain) { setInvoiceLoading(false); return; }

      // Determine actual status: contract keeps status=pending even after expiry block
      let invoiceStatus = STATUS_MAP[onChain.status] ?? "pending";
      if (
        (invoiceStatus === "pending" || invoiceStatus === "partial") &&
        onChain.expiresAt > 0
      ) {
        const burnHeight = await fetchBurnBlockHeight().catch(() => 0);
        if (burnHeight > 0 && burnHeight > onChain.expiresAt) {
          invoiceStatus = "expired";
        }
      }

      // Fetch payments/refunds from Supabase (supplementary data)
      const db = address ? supabaseWithWallet(address) : supabase;
      const [paymentsRes, refundsRes, invoiceRow] = await Promise.all([
        db.from("payments").select("*").eq("invoice_id", numericId),
        db.from("refunds").select("*").eq("invoice_id", numericId),
        db.from("invoices").select("created_at, paid_at_block").eq("id", numericId).maybeSingle(),
      ]);

      // Resolve real timestamps from burn block heights (on-chain source of truth)
      const [chainCreatedAt, chainPaidAt] = await Promise.all([
        onChain.createdAt > 0 ? fetchBurnBlockTimestamp(Number(onChain.createdAt)) : Promise.resolve(null),
        onChain.paidAt && onChain.paidAt > 0 ? fetchBurnBlockTimestamp(Number(onChain.paidAt)) : Promise.resolve(null),
      ]);

      const dbCreatedAt = invoiceRow.data?.created_at
        ? new Date(invoiceRow.data.created_at)
        : null;
      const dbPaidAtBlock = invoiceRow.data?.paid_at_block;
      const dbPaidAt = dbPaidAtBlock
        ? await fetchBurnBlockTimestamp(dbPaidAtBlock).catch(() => null)
        : null;

      // Prefer Supabase timestamps (wall-clock accurate from webhook),
      // then blockchain burn-block timestamps (Bitcoin block headers can lag hours).
      const resolvedCreatedAt = dbCreatedAt || chainCreatedAt || new Date();
      const resolvedPaidAt = dbPaidAt || chainPaidAt || null;

      // Build payments: prefer Supabase rows, fall back to blockchain events
      let payments: Payment[] = (paymentsRes.data ?? []).map((p) => ({
        timestamp: new Date(p.created_at),
        amount: p.amount,
        txId: p.tx_id || "",
        payer: p.payer || "",
      }));

      // Blockchain fallback: if Supabase has no payments but on-chain shows paid,
      // query the Stacks API for contract events (source of truth)
      if (payments.length === 0 && Number(onChain.amountPaid) > 0) {
        const chainEvents = await fetchPaymentEventsForInvoice(numericId);
        if (chainEvents.length > 0) {
          payments = chainEvents.map((ev) => ({
            timestamp: ev.timestamp,
            amount: ev.amount || Number(onChain.amountPaid),
            txId: ev.txId,
            payer: ev.payer || "",
          }));
        } else {
          // Last resort: synthesize from on-chain data with blockchain-resolved timestamp
          payments = [{
            timestamp: resolvedPaidAt || resolvedCreatedAt,
            amount: Number(onChain.amountPaid),
            txId: "",
            payer: onChain.payer || "",
          }];
        }
      }

      setRemoteInvoice({
        id: `INV-${numericId}`,
        dbId: numericId,
        amount: Number(onChain.amount),
        amountPaid: Number(onChain.amountPaid),
        memo: onChain.memo || "",
        referenceId: onChain.referenceId || "",
        status: invoiceStatus,
        allowPartial: onChain.allowPartial,
        allowOverpay: onChain.allowOverpay,
        merchantAddress: onChain.merchant,
        payerAddress: onChain.payer || "",
        createdAt: resolvedCreatedAt,
        expiresAt: null,
        payments,
        refunds: (refundsRes.data ?? []).map((r) => ({
          timestamp: new Date(r.created_at),
          amount: r.amount,
          reason: r.reason || "",
          txId: r.tx_id || "",
        })),
        tokenType: onChain.tokenType || 'sbtc',
      });
      setInvoiceLoading(false);
    })();
  }, [invoiceId, storeInvoice, address]);

  const invoice = storeInvoice || remoteInvoice;

  const [paymentState, setPaymentState] = useState<"idle" | "confirming" | "confirmed" | "error">("idle");
  const [completedPayment, setCompletedPayment] = useState<Payment | null>(null);
  const [payAmount, setPayAmount] = useState<string>("");
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [txId, setTxId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [invoiceExpired, setInvoiceExpired] = useState(false);
  const confirmedAmount = useRef<number>(0);
  const mountedRef = useRef(true);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const abortRef = useRef<AbortController | null>(null);

  // --- Pending payment localStorage helpers (double-pay guard + recovery) ---
  const pendingKey = invoiceId ? `sbtc-pay-pending-tx-${invoiceId}` : null;

  function savePendingPayment(txIdVal: string, amount: number) {
    if (!pendingKey) return;
    localStorage.setItem(pendingKey, JSON.stringify({ txId: txIdVal, amount, submittedAt: Date.now() }));
  }
  function clearPendingPayment() {
    if (pendingKey) localStorage.removeItem(pendingKey);
  }
  function loadPendingPayment(): { txId: string; amount: number; submittedAt: number } | null {
    if (!pendingKey) return null;
    try {
      const raw = localStorage.getItem(pendingKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      // Expire after 10 minutes (tx should have finalized by then)
      if (Date.now() - parsed.submittedAt > 10 * 60 * 1000) {
        localStorage.removeItem(pendingKey);
        return null;
      }
      return parsed;
    } catch { return null; }
  }

  // --- Recover pending payment on mount ---
  useEffect(() => {
    const pending = loadPendingPayment();
    if (!pending) return;
    // Resume polling for the pending tx
    setTxId(pending.txId);
    confirmedAmount.current = pending.amount;
    setPaymentState("confirming");
    setCompletedPayment({ timestamp: new Date(), amount: pending.amount, txId: pending.txId, payer: "" });
    toast.info("Resuming payment confirmation...");

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    waitForTransaction(pending.txId, 40, 8000, ctrl.signal)
      .then((txResult) => {
        if (!mountedRef.current) return;
        if (txResult.status === "success") {
          setPaymentState("confirmed");
          clearPendingPayment();
          toast.success("Payment confirmed on-chain!");
          fetchBalances();
        } else if (txResult.status === "failed") {
          setPaymentState("error");
          setCompletedPayment(null);
          clearPendingPayment();
          toast.error("Payment was rejected on-chain.");
        } else {
          // still pending after max attempts
          setPaymentState("confirmed");
          clearPendingPayment();
          toast.info("Transaction submitted but not yet confirmed. Check back shortly.");
        }
      })
      .catch(() => { /* aborted */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimeout(copyTimerRef.current);
      abortRef.current?.abort();
    };
  }, []);

  // Check if this is a blockchain invoice (has a DB/on-chain id)
  const isBlockchainInvoice = invoice && invoice.dbId > 0;
  const blockchainInvoiceId = isBlockchainInvoice ? invoice.dbId : null;

  const remaining = useMemo(() => {
    if (!invoice) return 0;
    return invoice.amount - invoice.amountPaid;
  }, [invoice]);

  // Initialize pay amount when invoice loads
  const effectivePayAmount = useMemo(() => {
    if (!invoice) return 0;
    if ((invoice.allowPartial || invoice.allowOverpay) && payAmount !== "") {
      const val = parseFloat(payAmount);
      if (!isNaN(val) && val > 0) {
        const baseUnits = humanToBaseUnits(val, invoice.tokenType);
        // Partial: cap at remaining. Overpay: allow above remaining. Both: no cap needed.
        if (invoice.allowOverpay) return Math.max(baseUnits, 0);
        return Math.min(baseUnits, remaining);
      }
    }
    return remaining;
  }, [invoice, payAmount, remaining]);

  const handlePay = useCallback(async () => {
    if (!invoice || effectivePayAmount <= 0 || paymentState !== "idle" || invoiceExpired) return;
    // Guard: don't allow paying already-paid/expired/cancelled invoices
    if (invoice.status === "paid" || invoice.status === "expired" || invoice.status === "cancelled" || invoice.status === "refunded") {
      toast.error(`This invoice is ${invoice.status} and cannot be paid.`);
      return;
    }
    // Guard: check for an existing pending payment (double-pay protection)
    const existingPending = loadPendingPayment();
    if (existingPending) {
      toast.warning("A payment for this invoice is already in progress. Please wait for it to confirm.");
      return;
    }
    confirmedAmount.current = effectivePayAmount;
    setPaymentState("confirming");
    setErrorMessage(null);

    try {
      if (isBlockchainInvoice && blockchainInvoiceId !== null && address) {
        // Guard: deployer/fee-recipient cannot pay invoices (Clarity ft-transfer disallows self-transfer for fee)
        if (address === PAYMENT_CONTRACT.address) {
          toast.error("The platform fee-recipient wallet cannot pay invoices. Please use a different wallet.");
          setErrorMessage("The platform fee-recipient wallet cannot pay invoices. Please use a different wallet.");
          setPaymentState("error");
          return;
        }

        // Guard: check wallet balance before attempting payment
        const walletBalance = invoice.tokenType === 'stx' ? stxBalance : sbtcBalance;
        if (walletBalance < BigInt(effectivePayAmount)) {
          const label = tokenLabel(invoice.tokenType);
          const needed = formatAmount(effectivePayAmount, invoice.tokenType);
          const have = formatAmount(Number(walletBalance), invoice.tokenType);
          const msg = `Insufficient ${label} balance: need ${needed} but wallet has ${have}`;
          toast.error(msg);
          setErrorMessage(msg);
          setPaymentState("error");
          return;
        }
        // Real blockchain payment
        toast.info("Please confirm the transaction in your wallet");
        
        const result = await payInvoice({
          invoiceId: blockchainInvoiceId,
          amount: BigInt(effectivePayAmount),
          payerAddress: address,
          tokenType: invoice.tokenType,
        });

        if (!mountedRef.current) return;

        if (result.txId) {
          // Persist pending payment so we can recover on page reload
          savePendingPayment(result.txId, effectivePayAmount);
          setTxId(result.txId);
          toast.success("Transaction submitted! Waiting for confirmation...");
          // Show "confirming" state with spinner while we poll
          setCompletedPayment({
            timestamp: new Date(),
            amount: effectivePayAmount,
            txId: result.txId,
            payer: address || "",
          });
          // Don't set "confirmed" yet — poll for on-chain result with AbortController
          const ctrl = new AbortController();
          abortRef.current = ctrl;
          const txResult = await waitForTransaction(result.txId, 40, 8000, ctrl.signal);
          if (!mountedRef.current) return;

          if (txResult.status === 'success') {
            clearPendingPayment();
            setPaymentState("confirmed");
            toast.success("Payment confirmed on-chain!");
            fetchBalances();
            // Optimistic: add payment to local store so Payment History shows immediately
            if (blockchainInvoiceId !== null) {
              addConfirmedPayment(blockchainInvoiceId, confirmedAmount.current, result.txId);
            }
            // Also update local remoteInvoice if that's what we're displaying
            if (remoteInvoice) {
              setRemoteInvoice((prev) => prev ? {
                ...prev,
                amountPaid: prev.amountPaid + confirmedAmount.current,
                status: prev.amountPaid + confirmedAmount.current >= prev.amount ? "paid" : "partial",
                payments: [...prev.payments, { timestamp: new Date(), amount: confirmedAmount.current, txId: result.txId, payer: address || "" }],
              } : prev);
            }
          } else if (txResult.status === 'failed') {
            clearPendingPayment();
            // Parse error from tx result
            let failMsg = "Payment was rejected on-chain";
            const resultRepr = (txResult.result as { repr?: string })?.repr || "";
            const errorMatch = resultRepr.match(/\(err u(\d+)\)/);
            if (errorMatch) {
              const code = parseInt(errorMatch[1], 10);
              failMsg = CONTRACT_ERRORS[code] || `Contract error u${code}`;
              // Handle low-level token transfer errors (from ft-transfer?)
              if (code <= 10) {
                if (code === 1) failMsg = `Insufficient ${tokenLabel(invoice.tokenType)} balance`;
                else if (code === 2) failMsg = "Cannot pay invoice — your wallet is the fee recipient. Use a different wallet.";
                else if (code === 3) failMsg = "Invalid payment amount";
                else failMsg = `${tokenLabel(invoice.tokenType)} transfer failed — check your balance`;
              }
            }
            setErrorMessage(failMsg);
            setPaymentState("error");
            setCompletedPayment(null);
            toast.error(failMsg);
          } else {
            // Still pending after max attempts
            clearPendingPayment();
            setPaymentState("confirmed");
            toast.info("Transaction submitted but not yet confirmed. Check back shortly.");
          }
        } else {
          setCompletedPayment({
            timestamp: new Date(),
            amount: effectivePayAmount,
            txId: 'pending',
            payer: address || "",
          });
          setPaymentState("confirmed");
        }
      } else {
        // Invoice not yet confirmed on-chain or wallet not connected
        const reason = !address
          ? "Please connect your wallet to pay this invoice."
          : "This invoice is still being confirmed on-chain. Please try again in a few minutes.";
        setErrorMessage(reason);
        setPaymentState("error");
        toast.error(reason);
      }
    } catch (error) {
      if (!mountedRef.current) return;
      // Map contract error codes to friendly messages
      let message = "Payment failed";
      if (error instanceof Error) {
        const codeMatch = error.message.match(/u(\d{4})/);
        if (codeMatch) {
          const code = parseInt(codeMatch[1], 10);
          message = CONTRACT_ERRORS[code] || error.message;
        } else {
          message = error.message;
        }
      }
      setErrorMessage(message);
      setPaymentState("error");
      toast.error(message);
    }
  }, [invoice, effectivePayAmount, paymentState, invoiceExpired, isBlockchainInvoice, blockchainInvoiceId, address, stxBalance, sbtcBalance, fetchBalances]);

  // --- Loading ---
  if (invoiceLoading) {
    return (
      <PageShell>
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-body-sm text-muted-foreground">Loading invoice...</p>
        </div>
      </PageShell>
    );
  }

  // --- Not Found or Pending Confirmation ---
  if (!invoice) {
    const isPendingOptimistic = invoiceId && isNaN(parseInt(invoiceId, 10));
    return (
      <PageShell>
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          {isPendingOptimistic ? (
            <>
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <h1 className="text-heading-sm text-foreground">Invoice Pending Confirmation</h1>
              <p className="text-body-sm text-muted-foreground max-w-xs">
                This invoice is still being confirmed on-chain. Please wait a few minutes and try again.
              </p>
            </>
          ) : (
            <>
              <AlertTriangle className="h-12 w-12 text-muted-foreground" />
              <h1 className="text-heading-sm text-foreground">Invoice Not Found</h1>
              <p className="text-body-sm text-muted-foreground max-w-xs">
                The invoice <code className="text-primary">{invoiceId}</code> doesn't exist or has been removed.
              </p>
            </>
          )}
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
    const lastPayment = invoice.payments.length > 0
      ? invoice.payments[invoice.payments.length - 1]
      : null;
    return (
      <PageShell>
        <InvoiceHeader invoice={invoice} />
        <PaymentConfirmation
          payment={lastPayment}
          amount={invoice.amountPaid}
          tokenType={invoice.tokenType}
          invoiceId={invoice.id}
          merchantAddress={invoice.merchantAddress}
          memo={invoice.memo}
          btcPriceUsd={btcPriceUsd}
          stxPriceUsd={stxPriceUsd}
        />
      </PageShell>
    );
  }

  // --- Confirming / Confirmed (our flow) ---
  if (paymentState === "confirming" || paymentState === "confirmed") {
    return (
      <PageShell>
        <InvoiceHeader invoice={invoice} />
        <PaymentConfirmation
          payment={completedPayment}
          amount={confirmedAmount.current}
          confirmed={paymentState === "confirmed"}
          tokenType={invoice.tokenType}
          invoiceId={invoice.id}
          merchantAddress={invoice.merchantAddress}
          memo={invoice.memo}
          btcPriceUsd={btcPriceUsd}
          stxPriceUsd={stxPriceUsd}
        />
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
            {errorMessage || "Something went wrong while processing your payment."}
          </p>
          <Button
            variant="outline"
            onClick={() => {
              setPaymentState("idle");
              setErrorMessage(null);
              setCompletedPayment(null);
            }}
          >
            Try Again
          </Button>
          {txId && (
            <a
              href={getExplorerTxUrl(txId)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary text-body-sm underline"
            >
              Check transaction on explorer →
            </a>
          )}
        </div>
      </PageShell>
    );
  }

  // --- Awaiting Payment ---
  const paidPercent = invoice.amount > 0 ? Math.round((invoice.amountPaid / invoice.amount) * 100) : 0;
  const tt = invoice.tokenType;
  const usdAmount = parseFloat(amountToUsd(remaining, tt, btcPriceUsd, stxPriceUsd)) || 0;
  // Match contract's calculate-fee: floor division, min 1 unit when amount > 0
  const feeSats = remaining > 0
    ? Math.max(Math.floor(remaining * feeBps / 10000), feeBps > 0 ? 1 : 0)
    : 0;
  const merchantReceives = remaining - feeSats;
  const feePercent = (feeBps / 100).toFixed(1);
  // Pick wallet balance based on token type
  const walletBalanceUnits = Number(tt === 'stx' ? stxBalance : sbtcBalance);
  const hasSufficient = isConnected && walletBalanceUnits >= effectivePayAmount;

  return (
    <PageShell>
      <InvoiceHeader invoice={invoice} />

      {/* Amount Due */}
      <div className="flex flex-col items-center gap-1 text-center">
        <span className="text-caption text-muted-foreground uppercase tracking-wider">Amount Due</span>
        <span className="text-heading-lg text-primary font-tabular font-bold">
          {formatAmount(remaining, tt)} <span className="text-body-lg font-medium">{tokenLabel(tt)}</span>
        </span>
        <span className="text-body-sm text-muted-foreground">
          ~${usdAmount.toFixed(2)} USD
        </span>
        <PriceStatusBadge />
      </div>

      {/* QR Code — encodes the payment page URL so scanning opens this page */}
      <div className="flex justify-center">
        <PaymentQRCode value={`${window.location.origin}/pay/${invoiceId}`} />
      </div>

      <Separator className="bg-border" />

      {/* Fee Breakdown */}
      <div className="flex flex-col gap-2 rounded-lg bg-muted p-3">
        <p className="text-caption font-medium text-muted-foreground uppercase tracking-wider">Fee Breakdown</p>
        <div className="flex justify-between text-body-sm">
          <span className="text-muted-foreground">Amount</span>
          <span className="text-foreground font-tabular">{formatAmount(remaining, tt)} {tokenLabel(tt)}</span>
        </div>
        <div className="flex justify-between text-body-sm">
          <span className="text-muted-foreground">Fee ({feePercent}%)</span>
          <span className="text-foreground font-tabular">{formatAmount(feeSats, tt)} {tokenLabel(tt)}</span>
        </div>
        <Separator className="bg-border" />
        <div className="flex justify-between text-body-sm font-medium">
          <span className="text-muted-foreground">Merchant receives</span>
          <span className="text-foreground font-tabular">{formatAmount(merchantReceives, tt)} {tokenLabel(tt)}</span>
        </div>
      </div>

      {/* Balance Check — show "Loading…" during the connect → auth → fetch chain
          so we don't flash "Insufficient" with a stale 0 balance before the
          real amount has been read from the chain. */}
      {isConnected && balancesLoading && (
        <div className="flex items-center justify-between rounded-lg p-3 text-body-sm bg-muted/40 border border-border">
          <span className="text-muted-foreground">Your {tokenLabel(tt)}:</span>
          <span className="font-tabular text-muted-foreground inline-flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" />
            Checking balance…
          </span>
        </div>
      )}
      {isConnected && !balancesLoading && (
        <div className={`flex items-center justify-between rounded-lg p-3 text-body-sm ${hasSufficient ? "bg-success/10 border border-success/30" : "bg-destructive/10 border border-destructive/30"}`}>
          <span className="text-muted-foreground">Your {tokenLabel(tt)}:</span>
          <span className={`font-tabular ${hasSufficient ? "text-success" : "text-destructive"}`}>
            {formatAmount(walletBalanceUnits, tt)} {tokenLabel(tt)} — {hasSufficient ? "Sufficient" : "Insufficient"}
          </span>
        </div>
      )}

      {/* Details */}
      <div className="flex flex-col gap-space-sm">
        <div className="flex justify-between text-body-sm">
          <span className="text-muted-foreground">Merchant</span>
          <span className="text-foreground font-mono text-caption">
            {truncateAddress(invoice.merchantAddress)}
          </span>
        </div>

        {invoice.expiresAt && (
          <div className="flex justify-between items-center text-body-sm">
            <span className="text-muted-foreground">Expires in</span>
            <ExpirationCountdown expiresAt={invoice.expiresAt} onExpired={() => setInvoiceExpired(true)} />
          </div>
        )}

        {invoice.amountPaid > 0 && (
          <div className="flex flex-col gap-2">
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
      <div className="flex flex-col gap-space-md">
        {(invoice.allowPartial || invoice.allowOverpay) && (
          <div className="flex flex-col gap-2">
            <label className="text-caption text-muted-foreground">
              Payment amount ({tokenLabel(tt)})
              {invoice.allowPartial && !invoice.allowOverpay && (
                <span className="ml-1 text-muted-foreground/60">· min any, max {formatAmount(remaining, tt)}</span>
              )}
              {invoice.allowOverpay && !invoice.allowPartial && (
                <span className="ml-1 text-muted-foreground/60">· min {formatAmount(remaining, tt)}</span>
              )}
              {invoice.allowPartial && invoice.allowOverpay && (
                <span className="ml-1 text-muted-foreground/60">· any amount</span>
              )}
            </label>
            <Input
              type="number"
              step={tt === 'stx' ? '0.000001' : '0.00000001'}
              min={tt === 'stx' ? 0.000001 : 0.00000001}
              {...(!invoice.allowOverpay ? { max: baseToHuman(remaining, tt) } : {})}
              placeholder={formatAmount(remaining, tt)}
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              disabled={paymentState !== "idle"}
              className="font-tabular [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
        )}

        {!isConnected ? (
          <div className="flex flex-col gap-space-sm">
            {/* Testnet warning */}
            <div className="flex items-center justify-center gap-2 p-2 rounded-lg bg-primary/10 border border-primary/30">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              <span className="text-caption text-primary">Testnet Mode - Switch wallet to Testnet before connecting</span>
            </div>
            <Button
              disabled={isConnecting}
              className="w-full h-12 text-body font-semibold gap-2"
              onClick={async () => {
                clearError();
                await connect();
                const state = useWalletStore.getState();
                if (state.isConnected && !state.connectionError) {
                  toast.success("Wallet connected", {
                    style: {
                      background: 'hsl(var(--success))',
                      color: 'hsl(var(--success-foreground))',
                      border: '1px solid hsl(var(--success))',
                    },
                  });
                } else if (state.connectionError?.type === 'network_mismatch') {
                  toast.error(`Wrong network. Please switch to ${NETWORK_MODE} in your wallet`, { 
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
            disabled={paymentState !== "idle" || balancesLoading || !hasSufficient || invoiceExpired}
          >
            {balancesLoading ? (
              <><Loader2 className="h-5 w-5 animate-spin" />Checking balance…</>
            ) : (
              <><Bitcoin className="h-5 w-5" />Pay {formatAmount(effectivePayAmount, tt)} {tokenLabel(tt)}</>
            )}
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
            clearTimeout(copyTimerRef.current);
            copyTimerRef.current = setTimeout(() => setCopiedAddress(false), 2000);
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
      <div className="flex min-h-svh items-center justify-center bg-background p-fluid-md">
        <Card className="w-full max-w-md border-border">
          <CardContent className="p-4 sm:p-6 md:p-8 flex flex-col gap-space-lg">
            {/* Branding */}
            <div className="flex items-center justify-center gap-2.5">
              <img src="/favicon.png" className="h-10 w-10 sm:h-12 sm:w-12 shrink-0 rounded-2xl object-contain" alt="" aria-hidden="true" />
              <span className="text-heading-sm text-primary">sBTC Pay</span>
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
    <div className="text-center flex flex-col gap-1">
      <h1 className="text-heading-sm font-display text-foreground">Invoice #{invoice.id}</h1>
      {invoice.memo && (
        <p className="text-body-sm text-muted-foreground italic">"{invoice.memo}"</p>
      )}
    </div>
  );
}
