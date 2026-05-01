import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Loader2, ExternalLink, FileText, CheckCircle2, Share2, Check, Copy } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
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

interface ReceiptPdfData {
  invoiceId: string;
  merchantAddress: string;
  memo: string;
  txId: string | null;
  explorerUrl: string | null;
  formattedAmount: string;
  tokenSymbol: string;
  usdValue: string;
  confirmed: boolean;
  networkLabel: string;
  date: string | null;
}

// Truncate text to fit within maxWidthMm using actual jsPDF font metrics
function pdfFit(pdf: InstanceType<Awaited<typeof import("jspdf")>["jsPDF"]>, text: string, maxWidthMm: number): string {
  if (pdf.getTextWidth(text) <= maxWidthMm) return text;
  let t = text;
  while (t.length > 1 && pdf.getTextWidth(t + "…") > maxWidthMm) {
    t = t.slice(0, -1);
  }
  return t + "…";
}

async function loadImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function generateReceiptPdf(data: ReceiptPdfData, filename: string) {
  const { jsPDF } = await import("jspdf");
  // qrcode is a transitive dep of qrcode.react – available at runtime
  const QRCode = await import("qrcode");

  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const H = 297;
  const M = 18;
  const CW = W - M * 2; // 174 mm

  let y = 0;

  // Load logo (best-effort; skip if unavailable)
  const logoDataUrl = await loadImageAsDataUrl("/favicon.png");

  // ── Header bar ───────────────────────────────────────────────
  pdf.setFillColor(249, 115, 22);
  pdf.rect(0, 0, W, 36, "F");

  // Logo — 10×10 mm, vertically centred in header, right-aligned before network pill
  const logoSize = 10;
  if (logoDataUrl) {
    pdf.addImage(logoDataUrl, "JPEG", M, (36 - logoSize) / 2, logoSize, logoSize);
  }

  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(17);
  // Offset text right of logo when logo is present
  const textX = logoDataUrl ? M + logoSize + 3 : M;
  pdf.text("sBTC Pay", textX, 15);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(255, 220, 190);
  pdf.text("Blockchain-Verified Payment Receipt", textX, 23);

  // Network pill — sized to text
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(6);
  const pillText = data.networkLabel.toUpperCase();
  const pillW = pdf.getTextWidth(pillText) + 8;
  pdf.setFillColor(255, 237, 213);
  pdf.roundedRect(W - M - pillW, 11, pillW, 8, 2, 2, "F");
  pdf.setTextColor(234, 88, 12);
  pdf.text(pillText, W - M - pillW / 2, 16.5, { align: "center" });

  y = 36;

  // ── Amount hero ──────────────────────────────────────────────
  // Content group: pill(8mm) + gap(6mm) + amount(9mm) + gap(4mm) + USD(4mm) = 31mm
  // heroH = 31 + 10 top + 10 bottom = 51mm — evenly padded
  const heroH = 51;
  pdf.setFillColor(248, 250, 252);
  pdf.rect(0, y, W, heroH, "F");

  // Status pill — 10mm from top of hero
  const statusPillH = 8;
  const statusPillW = 44;
  const statusPillX = W / 2 - statusPillW / 2;
  const statusPillY = y + 10;
  // Baseline = pill-center + cap-height/2; at 6.5pt em≈2.3mm, cap≈1.65mm → +0.8mm
  const statusPillTextY = statusPillY + statusPillH / 2 + 0.8;

  pdf.setFillColor(data.confirmed ? 34 : 249, data.confirmed ? 197 : 115, data.confirmed ? 94 : 22);
  pdf.roundedRect(statusPillX, statusPillY, statusPillW, statusPillH, statusPillH / 2, statusPillH / 2, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(6.5);
  pdf.text(data.confirmed ? "CONFIRMED" : "PENDING", W / 2, statusPillTextY, { align: "center" });

  // Amount — 6mm below pill bottom
  const amountY = statusPillY + statusPillH + 6 + 7; // +7 for ascender at 26pt
  pdf.setTextColor(15, 23, 42);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(26);
  pdf.text(`${data.formattedAmount} ${data.tokenSymbol}`, W / 2, amountY, { align: "center" });

  if (data.usdValue && data.usdValue !== "—") {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(100, 116, 139);
    pdf.text(`approx. $${data.usdValue} USD`, W / 2, amountY + 8, { align: "center" });
  }

  y += heroH;

  // ── White content area ───────────────────────────────────────
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, y, W, H - y, "F");

  y += 14;

  // Section heading
  pdf.setTextColor(15, 23, 42);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);
  pdf.text("TRANSACTION DETAILS", M, y);
  pdf.setDrawColor(249, 115, 22);
  pdf.setLineWidth(0.5);
  pdf.line(M, y + 3, M + 44, y + 3);

  y += 10;

  // Detail rows
  const rows: Array<{ label: string; value: string; mono?: boolean }> = [];
  if (data.invoiceId) rows.push({ label: "Invoice ID", value: data.invoiceId });
  if (data.merchantAddress) rows.push({ label: "Merchant", value: data.merchantAddress, mono: true });
  if (data.memo) rows.push({ label: "Memo", value: data.memo });
  rows.push({ label: "Network", value: data.networkLabel });
  if (data.txId && data.txId !== "pending") rows.push({ label: "Transaction ID", value: data.txId, mono: true });
  if (data.date) rows.push({ label: "Date & Time", value: data.date });

  const rowH = 11;
  // Label takes ~45 mm; value gets the rest
  const valueMaxW = CW - 47;

  for (let i = 0; i < rows.length; i++) {
    const { label, value, mono } = rows[i];
    const ry = y + i * rowH;

    if (i % 2 === 0) {
      pdf.setFillColor(248, 250, 252);
      pdf.rect(M - 4, ry - 5, CW + 8, rowH, "F");
    }

    pdf.setTextColor(100, 116, 139);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.text(label, M, ry);

    pdf.setTextColor(15, 23, 42);
    pdf.setFont(mono ? "courier" : "helvetica", "bold");
    pdf.setFontSize(mono ? 7 : 7.5);
    // Truncate using real glyph metrics — no more char-count guessing
    const display = pdfFit(pdf, value, valueMaxW);
    pdf.text(display, W - M, ry, { align: "right" });
  }

  y += rows.length * rowH + 10;

  // ── Total summary bar ────────────────────────────────────────
  pdf.setFillColor(249, 115, 22);
  pdf.roundedRect(M - 4, y, CW + 8, 16, 3, 3, "F");

  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text("Total Amount Paid", M + 2, y + 10);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.text(`${data.formattedAmount} ${data.tokenSymbol}`, W - M - 2, y + 10, { align: "right" });

  y += 24;

  // ── Explorer URL + QR code ───────────────────────────────────
  if (data.explorerUrl) {
    const qrSize = 30; // mm

    // Generate QR as PNG data URL
    let qrDataUrl: string | null = null;
    try {
      qrDataUrl = await QRCode.toDataURL(data.explorerUrl, {
        width: 256,
        margin: 2,
        color: { dark: "#0f172a", light: "#ffffff" },
      });
    } catch {
      // QR unavailable; render without it
    }

    const textColW = qrDataUrl ? CW - qrSize - 8 : CW;

    pdf.setTextColor(100, 116, 139);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text("Verify on Stacks Explorer:", M, y + 5);

    pdf.setTextColor(249, 115, 22);
    pdf.setFontSize(7);
    pdf.setFont("helvetica", "normal");
    const urlDisplay = pdfFit(pdf, data.explorerUrl, textColW);
    pdf.textWithLink(urlDisplay, M, y + 12, { url: data.explorerUrl });

    if (qrDataUrl) {
      // Light card behind QR
      pdf.setFillColor(248, 250, 252);
      pdf.roundedRect(W - M - qrSize - 2, y - 2, qrSize + 4, qrSize + 8, 2, 2, "F");
      pdf.addImage(qrDataUrl, "PNG", W - M - qrSize, y, qrSize, qrSize);
      pdf.setTextColor(148, 163, 184);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(6);
      pdf.text("Scan to verify", W - M - qrSize / 2, y + qrSize + 4, { align: "center" });
    }

    y += Math.max(22, qrSize + 10);
  }

  // ── Dashed cut line ──────────────────────────────────────────
  pdf.setDrawColor(226, 232, 240);
  pdf.setLineDashPattern([2, 2], 0);
  pdf.setLineWidth(0.3);
  pdf.line(M, y, W - M, y);
  pdf.setLineDashPattern([], 0);

  y += 10;

  // ── Footer note ──────────────────────────────────────────────
  pdf.setTextColor(148, 163, 184);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  pdf.text(
    "This receipt is cryptographically verifiable on the Stacks blockchain.",
    W / 2, y, { align: "center" },
  );
  pdf.text(
    `Generated by sBTC Pay · ${new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })}`,
    W / 2, y + 5.5, { align: "center" },
  );

  // ── Bottom brand bar ─────────────────────────────────────────
  pdf.setFillColor(249, 115, 22);
  pdf.rect(0, H - 10, W, 10, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);
  pdf.text("sBTC Pay", M, H - 4);
  pdf.setFont("helvetica", "normal");
  pdf.text("sbtcpay.xyz", W - M, H - 4, { align: "right" });

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
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (payment || confirmed) {
      const timer = setTimeout(() => setShowContent(true), 800);
      return () => clearTimeout(timer);
    }
  }, [payment, confirmed]);

  const handleDownloadPdf = useCallback(async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const txHasId = payment?.txId && payment.txId !== "pending";
      await generateReceiptPdf(
        {
          invoiceId,
          merchantAddress,
          memo,
          txId: payment?.txId ?? null,
          explorerUrl: txHasId ? getExplorerTxUrl(payment!.txId) : null,
          formattedAmount: formatAmount(amount, tokenType),
          tokenSymbol: tokenLabel(tokenType),
          usdValue: amountToUsd(amount, tokenType, btcPriceUsd, stxPriceUsd),
          confirmed,
          networkLabel: NETWORK_MODE === "testnet" ? "Stacks Testnet" : "Stacks Mainnet",
          date: payment ? format(payment.timestamp, "MMM d, yyyy 'at' HH:mm") : null,
        },
        `receipt-${invoiceId || "payment"}.pdf`,
      );
    } catch {
      window.print();
    } finally {
      setDownloading(false);
    }
  }, [invoiceId, merchantAddress, memo, payment, amount, tokenType, btcPriceUsd, stxPriceUsd, confirmed, downloading]);

  const handleShare = useCallback(async () => {
    const hasTxId_ = payment?.txId && payment.txId !== "pending";
    const shareUrl = hasTxId_ ? getExplorerTxUrl(payment!.txId) : window.location.href;
    const shareText = `${formatAmount(amount, tokenType)} ${tokenLabel(tokenType)} payment confirmed on the Stacks blockchain.`;

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "Payment Receipt – sBTC Pay", text: shareText, url: shareUrl });
      } catch {
        // user cancelled
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // clipboard unavailable
      }
    }
  }, [payment, amount, tokenType]);

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

  // All rows in one unified array — index-based zebra, no CSS :nth-child surprises
  type Row =
    | { kind: "text"; label: string; value: string; mono?: boolean; title?: string }
    | { kind: "link"; label: string; href: string; display: string }
    | { kind: "badge"; label: string; confirmed: boolean };

  const allRows: Row[] = (
    [
      invoiceId ? ({ kind: "text", label: "Invoice", value: invoiceId } satisfies Row) : null,
      merchantAddress
        ? ({ kind: "text", label: "Merchant", value: truncateAddress(merchantAddress), mono: true, title: merchantAddress } satisfies Row)
        : null,
      memo ? ({ kind: "text", label: "Memo", value: memo } satisfies Row) : null,
      { kind: "text", label: "Network", value: networkLabel } satisfies Row,
      payment
        ? ({ kind: "text", label: "Date", value: format(payment.timestamp, "MMM d, yyyy 'at' HH:mm") } satisfies Row)
        : null,
      hasTxId && explorerUrl
        ? ({ kind: "link", label: "Transaction", href: explorerUrl, display: truncateAddress(payment!.txId) } satisfies Row)
        : null,
    ] as (Row | null)[]
  ).filter((r): r is Row => r !== null);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="w-full"
    >
      {/* ── Receipt card — no overflow-hidden so tear-line notches are visible ── */}
      <div className="w-full rounded-2xl border border-border/60 bg-card shadow-md">

        {/* ── Brand header — rounded top corners applied here ── */}
        <div className="flex items-center justify-between bg-primary px-5 py-3 rounded-t-2xl">
          <div className="flex items-center gap-2.5">
            <img src="/favicon.png" className="h-8 w-8 sm:h-9 sm:w-9 shrink-0 rounded-xl object-contain" alt="" aria-hidden="true" />
            <span className="text-sm font-bold tracking-wide text-white">sBTC Pay</span>
          </div>
          <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-white/90">
            {networkLabel}
          </span>
        </div>

        {/* ── Hero: status icon + amount ── */}
        <div className="flex flex-col items-center gap-3 px-6 py-7 text-center">
          {confirmed ? (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.05, type: "spring", stiffness: 260, damping: 18 }}
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
                <CheckCircle2 className="h-8 w-8 text-success" strokeWidth={2} />
              </div>
            </motion.div>
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}

          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ${
              confirmed ? "bg-success/10 text-success" : "bg-primary/10 text-primary"
            }`}
          >
            {confirmed ? "Payment Confirmed" : "Transaction Submitted"}
          </span>

          <div>
            <p className="text-3xl font-bold tracking-tight text-foreground font-tabular">
              {formatAmount(amount, tokenType)}{" "}
              <span className="text-primary">{tokenLabel(tokenType)}</span>
            </p>
            {usdValue !== "—" && (
              <p className="mt-1 text-sm text-muted-foreground">≈ ${usdValue} USD</p>
            )}
          </div>
        </div>

        {/* ── Perforated tear line — notches extend outside card (no overflow-hidden on parent) ── */}
        <div className="relative mx-0 flex items-center">
          <div className="absolute -left-3 z-10 h-6 w-6 rounded-full bg-background" />
          <div className="flex-1 border-t border-dashed border-border/70 mx-3" />
          <div className="absolute -right-3 z-10 h-6 w-6 rounded-full bg-background" />
        </div>

        {/* ── Detail rows — explicit index zebra, no CSS :nth-child ── */}
        <div className="px-5 py-4">
          <div className="divide-y divide-border/50 rounded-xl border border-border/50 overflow-hidden">
            {allRows.map((row, idx) => (
              <div
                key={row.label}
                className={`flex items-center justify-between gap-4 px-4 py-3 ${idx % 2 === 1 ? "bg-muted/30" : "bg-card"}`}
              >
                <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {row.label}
                </span>

                {row.kind === "link" && (
                  <a
                    href={row.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 truncate font-mono text-xs font-medium text-primary hover:underline"
                  >
                    {row.display}
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                )}

                {row.kind === "badge" && (
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                      row.confirmed ? "bg-success/10 text-success" : "bg-primary/10 text-primary"
                    }`}
                  >
                    {row.confirmed ? "✓ On-chain" : "Pending"}
                  </span>
                )}

                {row.kind === "text" && (
                  <span
                    className={`truncate text-right text-sm font-medium text-foreground ${row.mono ? "font-mono text-xs" : ""}`}
                    title={row.title}
                  >
                    {row.value}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Total summary bar ── */}
        <div className="mx-5 mb-5 flex items-center justify-between rounded-xl bg-primary/5 border border-primary/20 px-4 py-3.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Total Paid
          </span>
          <div className="text-right">
            <p className="text-base font-bold text-foreground font-tabular">
              {formatAmount(amount, tokenType)} {tokenLabel(tokenType)}
            </p>
            {usdValue !== "—" && (
              <p className="text-xs text-muted-foreground">≈ ${usdValue} USD</p>
            )}
          </div>
        </div>

        {/* ── Card footer / actions — rounded bottom corners here ── */}
        <div className="flex items-center justify-between gap-2 border-t border-border/50 bg-muted/20 px-5 py-3 rounded-b-2xl">
          <p className="text-[11px] text-muted-foreground">Blockchain-verified receipt</p>

          <div className="flex items-center gap-1.5">
            {/* Share / copy link */}
            {confirmed && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                onClick={handleShare}
                title={copied ? "Link copied!" : "Share receipt"}
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-success" />
                ) : (
                  <Share2 className="h-3.5 w-3.5" />
                )}
                {copied ? "Copied!" : "Share"}
              </Button>
            )}

            {explorerUrl && (
              <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground" asChild>
                <a href={explorerUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Explorer
                </a>
              </Button>
            )}

            {confirmed && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 px-2.5 text-xs"
                onClick={handleDownloadPdf}
                disabled={downloading}
              >
                {downloading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileText className="h-3.5 w-3.5" />
                )}
                {downloading ? "Generating…" : "Save PDF"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
