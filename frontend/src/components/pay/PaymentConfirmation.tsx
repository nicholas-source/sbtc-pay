import { useEffect, useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Loader2, ExternalLink, Download, FileText } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { Payment } from "@/stores/invoice-store";
import { formatAmount, tokenLabel, amountToUsd } from "@/lib/constants";
import { getExplorerTxUrl, truncateAddress, NETWORK_MODE } from "@/lib/stacks/config";
import type { TokenType } from "@/lib/stacks/config";

interface Props {
  payment: Payment | null;
  amount: number;
  tokenType?: TokenType;
  confirmed?: boolean;
  invoiceId?: string;
  merchantAddress?: string;
  memo?: string;
  btcPriceUsd?: number | null;
  stxPriceUsd?: number | null;
}

async function captureReceiptAsPdf(element: HTMLElement, filename: string) {
  const html2canvas = (await import("html2canvas-pro")).default;
  const { jsPDF } = await import("jspdf");

  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
  });

  const imgData = canvas.toDataURL("image/png");
  const imgWidth = canvas.width;
  const imgHeight = canvas.height;

  // A4 width in points = 595.28, but we size to content
  const pdfWidth = 210; // mm (A4)
  const pdfImgWidth = pdfWidth - 20; // 10mm margins
  const pdfImgHeight = (imgHeight * pdfImgWidth) / imgWidth;
  const pdfHeight = Math.max(pdfImgHeight + 20, 100);

  const pdf = new jsPDF({ unit: "mm", format: [pdfWidth, pdfHeight] });
  pdf.addImage(imgData, "PNG", 10, 10, pdfImgWidth, pdfImgHeight);
  pdf.save(filename);
}

export function PaymentConfirmation({
  payment,
  amount,
  tokenType = "sbtc",
  confirmed = true,
  invoiceId = "",
  merchantAddress = "",
  memo = "",
  btcPriceUsd = null,
  stxPriceUsd = null,
}: Props) {
  const [showContent, setShowContent] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const receiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (payment || confirmed) {
      const timer = setTimeout(() => setShowContent(true), 800);
      return () => clearTimeout(timer);
    }
  }, [payment, confirmed]);

  const handleDownloadPdf = useCallback(async () => {
    if (!receiptRef.current || downloading) return;
    setDownloading(true);
    try {
      await captureReceiptAsPdf(
        receiptRef.current,
        `receipt-${invoiceId || "payment"}.pdf`,
      );
    } catch {
      // Fallback: open print dialog
      window.print();
    } finally {
      setDownloading(false);
    }
  }, [invoiceId, downloading]);

  // Pending state: payment not yet confirmed
  if (!showContent && !confirmed) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center gap-4 py-8"
      >
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <div className="text-center">
          <p className="text-heading-sm text-foreground">Confirming Payment</p>
          <p className="text-body-sm text-muted-foreground mt-1">
            Waiting for blockchain confirmation...
          </p>
        </div>
      </motion.div>
    );
  }

  // Brief reveal delay
  if (!showContent) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center gap-4 py-8"
      >
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <div className="text-center">
          <p className="text-heading-sm text-foreground">Loading payment…</p>
        </div>
      </motion.div>
    );
  }

  const hasTxId = payment?.txId && payment.txId !== "pending";
  const explorerUrl = hasTxId ? getExplorerTxUrl(payment!.txId) : null;
  const usdValue = amountToUsd(amount, tokenType, btcPriceUsd, stxPriceUsd);
  const networkLabel = NETWORK_MODE === "testnet" ? "Stacks Testnet" : "Stacks Mainnet";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="flex flex-col items-center gap-5 py-4"
    >
      {/* ── Printable receipt card ── */}
      <div
        ref={receiptRef}
        className="w-full rounded-xl border border-border bg-card shadow-sm overflow-hidden"
      >
        {/* Header */}
        <div className="bg-success/10 px-5 py-4 text-center">
          {confirmed ? (
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
              className="mx-auto mb-2"
            >
              <svg width="48" height="48" viewBox="0 0 64 64" className="text-success mx-auto">
                <motion.circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="3" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6, delay: 0.2 }} />
                <motion.path d="M20 32 L28 40 L44 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, delay: 0.6 }} />
              </svg>
            </motion.div>
          ) : (
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-2" />
          )}
          <p className={`text-heading-sm ${confirmed ? "text-success" : "text-primary"}`}>
            {confirmed ? "Payment Confirmed" : "Transaction Submitted"}
          </p>
          <p className="text-2xl font-bold text-foreground mt-1 font-tabular">
            {formatAmount(amount, tokenType)} {tokenLabel(tokenType)}
          </p>
          {usdValue !== "—" && (
            <p className="text-body-sm text-muted-foreground mt-0.5">≈ ${usdValue} USD</p>
          )}
        </div>

        {/* Details */}
        <div className="px-5 py-4 space-y-3 text-body-sm">
          {invoiceId && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Invoice</span>
              <span className="text-foreground font-medium">{invoiceId}</span>
            </div>
          )}

          {merchantAddress && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Merchant</span>
              <span className="text-foreground font-mono text-caption" title={merchantAddress}>
                {truncateAddress(merchantAddress)}
              </span>
            </div>
          )}

          {memo && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Memo</span>
              <span className="text-foreground truncate max-w-[180px]" title={memo}>{memo}</span>
            </div>
          )}

          <Separator className="my-1" />

          <div className="flex justify-between">
            <span className="text-muted-foreground">Status</span>
            <span className={confirmed ? "text-success font-medium" : "text-primary font-medium"}>
              {confirmed ? "✓ Confirmed on-chain" : "Pending…"}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-muted-foreground">Network</span>
            <span className="text-foreground">{networkLabel}</span>
          </div>

          {payment && (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Transaction</span>
                {hasTxId ? (
                  <a
                    href={explorerUrl!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate max-w-[140px] sm:max-w-[180px] text-primary font-mono text-caption hover:underline"
                  >
                    {truncateAddress(payment.txId)}
                  </a>
                ) : (
                  <span className={`text-caption ${confirmed ? "text-success font-medium" : "text-muted-foreground italic"}`}>
                    {confirmed ? "\u2713 Confirmed" : "Confirming\u2026"}
                  </span>
                )}
              </div>

              <div className="flex justify-between">
                <span className="text-muted-foreground">Date</span>
                <span className="text-foreground">
                  {format(payment.timestamp, "MMM d, yyyy 'at' HH:mm")}
                </span>
              </div>
            </>
          )}

          <Separator className="my-1" />

          <div className="flex justify-between">
            <span className="text-muted-foreground">Amount Paid</span>
            <span className="text-foreground font-semibold font-tabular">
              {formatAmount(amount, tokenType)} {tokenLabel(tokenType)}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-muted/40 px-5 py-2.5 text-center">
          <p className="text-caption text-muted-foreground">
            sBTC Pay • Blockchain-verified receipt
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap justify-center">
        {explorerUrl && (
          <Button variant="ghost" className="gap-2 text-muted-foreground" asChild>
            <a href={explorerUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" />
              View on Explorer
            </a>
          </Button>
        )}
        {confirmed && (
          <Button
            variant="outline"
            className="gap-2"
            onClick={handleDownloadPdf}
            disabled={downloading}
          >
            {downloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            {downloading ? "Generating…" : "Download Receipt"}
          </Button>
        )}
      </div>
    </motion.div>
  );
}
