/**
 * InvoiceMock — animated cycling invoice widget for the hero section.
 *
 * Cycles through 4 real-world business scenarios (partial, pending, paid)
 * with smooth Framer Motion transitions, animated progress bar, and
 * live BTC price from the wallet store.
 *
 * Layout:
 *  - Mobile: card only, no browser chrome
 *  - md+:    macOS-style browser frame wrapping the card
 */
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bitcoin, Clock, CheckCircle2 } from "lucide-react";
import { useBtcPrice, useSatsToUsd } from "@/stores/wallet-store";
import { formatSbtc } from "@/lib/constants";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = "pending" | "partial" | "paid";
type Wallet = "Leather" | "Xverse";

interface Scenario {
  id: string;
  merchant: string;
  initial: string;
  invoiceId: string;
  url: string;
  /** Amount in satoshis */
  amountSats: number;
  /** Amount paid so far in satoshis */
  paidSats: number;
  status: Status;
  wallet: Wallet;
  expiresIn: string | null;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const SCENARIOS: Scenario[] = [
  {
    id: "coffee",
    merchant: "Coffee Shop BTC",
    initial: "C",
    invoiceId: "INV-2026-0042",
    url: "sbtcpay.com/pay/inv-28f4a3",
    amountSats: 500_000,    // 0.005 sBTC
    paidSats: 310_000,      // 62 %
    status: "partial",
    wallet: "Leather",
    expiresIn: "23h 41m",
  },
  {
    id: "freelance",
    merchant: "Freelance Design Co.",
    initial: "F",
    invoiceId: "INV-2026-0118",
    url: "sbtcpay.com/pay/inv-7c9e21",
    amountSats: 1_200_000,  // 0.012 sBTC
    paidSats: 0,
    status: "pending",
    wallet: "Xverse",
    expiresIn: "47h 20m",
  },
  {
    id: "devtools",
    merchant: "Dev Tools Pro",
    initial: "D",
    invoiceId: "SUB-2026-0008",
    url: "sbtcpay.com/pay/sub-9a2b14",
    amountSats: 200_000,    // 0.002 sBTC
    paidSats: 200_000,      // 100 %
    status: "paid",
    wallet: "Leather",
    expiresIn: null,
  },
  {
    id: "bakery",
    merchant: "Bakery Online",
    initial: "B",
    invoiceId: "INV-2026-0205",
    url: "sbtcpay.com/pay/inv-4d8f67",
    amountSats: 800_000,    // 0.008 sBTC
    paidSats: 640_000,      // 80 %
    status: "partial",
    wallet: "Xverse",
    expiresIn: "6h 14m",
  },
];

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUS_CFG = {
  pending: {
    label: "Pending",
    badge: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
    bar: "from-blue-500/50 to-blue-400",
  },
  partial: {
    label: "Partial",
    badge: "bg-warning/10 text-warning border border-warning/25",
    bar: "from-primary/70 to-primary",
  },
  paid: {
    label: "Paid",
    badge: "bg-success/10 text-success border border-success/25",
    bar: "bg-success",
  },
} satisfies Record<Status, { label: string; badge: string; bar: string }>;

const WALLET_CTA: Record<Wallet, string> = {
  Leather: "bg-primary",
  Xverse: "bg-[#7B3FE4]",
};

// ─── Card ─────────────────────────────────────────────────────────────────────

function InvoiceCard({ s, satsToUsd, btcPrice }: {
  s: Scenario;
  satsToUsd: (sats: number) => string;
  btcPrice: number | null;
}) {
  const pct = s.amountSats > 0 ? Math.round((s.paidSats / s.amountSats) * 100) : 0;
  const remainingSats = s.amountSats - s.paidSats;
  const cfg = STATUS_CFG[s.status];
  const isPaid = s.status === "paid";
  const isPending = s.status === "pending";

  return (
    <motion.div
      key={s.id}
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -14, opacity: 0 }}
      transition={{ duration: 0.38, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="w-full max-w-[340px] rounded-xl border border-border bg-card p-5 shadow-lg select-none"
      aria-hidden="true"
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
            <span className="text-sm font-bold text-primary">{s.initial}</span>
          </div>
          <div>
            <p className="text-body-sm font-semibold text-foreground leading-tight">{s.merchant}</p>
            <p className="text-micro text-muted-foreground font-mono">{s.invoiceId}</p>
          </div>
        </div>

        <motion.span
          className={cn("text-micro font-semibold px-2 py-0.5 rounded-full", cfg.badge)}
          {...(isPending
            ? {
                animate: { opacity: [1, 0.5, 1] },
                transition: { duration: 2, repeat: Infinity, ease: "easeInOut" },
              }
            : {})}
        >
          {cfg.label}
        </motion.span>
      </div>

      {/* ── Amount ── */}
      <div className="mb-5">
        <p className="text-micro text-muted-foreground mb-1">Amount Due</p>
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono text-2xl font-bold text-foreground leading-none">
            {formatSbtc(s.amountSats)}
          </span>
          <span className="text-sm font-normal text-muted-foreground">sBTC</span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-caption text-muted-foreground">
            ≈ ${satsToUsd(s.amountSats)} USD
          </span>
          {btcPrice !== null && (
            <span className="text-micro text-muted-foreground/45 font-mono">
              ₿&thinsp;${btcPrice.toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </span>
          )}
        </div>
      </div>

      {/* ── Progress bar (partial / pending) ── */}
      {!isPaid && (
        <div className="mb-4">
          <div className="flex justify-between text-micro text-muted-foreground mb-1.5">
            <span>Payment received</span>
            <motion.span
              key={`pct-${s.id}`}
              className={cn("font-semibold", isPending ? "text-blue-400" : "text-primary")}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.55 }}
            >
              {pct}%
            </motion.span>
          </div>
          <div className="h-2 rounded-full bg-border overflow-hidden">
            <motion.div
              key={`bar-${s.id}`}
              className={cn("h-full rounded-full bg-gradient-to-r", cfg.bar)}
              initial={{ width: "0%" }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 1.15, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.2 }}
            />
          </div>
          <div className="flex justify-between text-micro text-muted-foreground mt-1.5">
            <span>{formatSbtc(s.paidSats)} sBTC paid</span>
            <span>{formatSbtc(remainingSats)} remaining</span>
          </div>
        </div>
      )}

      {/* ── Full bar (paid) ── */}
      {isPaid && (
        <div className="mb-4">
          <div className="h-2 rounded-full bg-success/20 overflow-hidden">
            <motion.div
              key={`bar-${s.id}`}
              className="h-full rounded-full bg-success"
              initial={{ width: "0%" }}
              animate={{ width: "100%" }}
              transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.15 }}
            />
          </div>
        </div>
      )}

      {/* ── Footer row ── */}
      <div className="flex items-center gap-1.5 mb-4 text-micro text-muted-foreground">
        {isPaid ? (
          <>
            <CheckCircle2 className="h-3 w-3 shrink-0 text-success" />
            <span className="text-success font-medium">Settled on Bitcoin</span>
          </>
        ) : (
          <>
            <Clock className="h-3 w-3 shrink-0" />
            <span>Expires in {s.expiresIn}</span>
          </>
        )}
      </div>

      {/* ── CTA button ── */}
      <motion.div
        key={`cta-${s.id}`}
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.3, duration: 0.3 }}
        className={cn(
          "h-10 rounded-lg flex items-center justify-center gap-2 pointer-events-none",
          isPaid
            ? "bg-success/10 border border-success/30"
            : WALLET_CTA[s.wallet],
        )}
      >
        {isPaid ? (
          <>
            <CheckCircle2 className="h-4 w-4 text-success" />
            <span className="text-body-sm font-semibold text-success">Payment Received</span>
          </>
        ) : (
          <>
            <Bitcoin className="h-4 w-4 text-white" />
            <span className="text-body-sm font-semibold text-white">
              Pay with {s.wallet}
            </span>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

// ─── Scenario dots ────────────────────────────────────────────────────────────

function ScenarioDots({
  count,
  active,
  onSelect,
}: {
  count: number;
  active: number;
  onSelect: (i: number) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-2 mt-4" role="tablist">
      {Array.from({ length: count }).map((_, i) => (
        <button
          key={i}
          type="button"
          role="tab"
          aria-label={`Go to scenario ${i + 1}`}
          aria-selected={i === active}
          onClick={() => onSelect(i)}
          className={cn(
            "rounded-full transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            i === active
              ? "w-5 h-1.5 bg-primary"
              : "w-1.5 h-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60",
          )}
        />
      ))}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

const INTERVAL_MS = 4500;

export default function InvoiceMock() {
  const [activeIdx, setActiveIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const btcPrice = useBtcPrice();
  const satsToUsd = useSatsToUsd();

  const advance = useCallback(() => {
    setActiveIdx((i) => (i + 1) % SCENARIOS.length);
  }, []);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(advance, INTERVAL_MS);
    return () => clearInterval(id);
  }, [paused, advance]);

  const s = SCENARIOS[activeIdx];

  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-label="Payment widget preview"
      role="region"
    >
      {/* ── Desktop: full browser frame ──────────────────────────────────────── */}
      <div className="hidden md:block rounded-2xl border border-border overflow-hidden shadow-2xl">
        {/* Browser chrome */}
        <div className="flex items-center gap-4 px-4 py-3 border-b border-border bg-card">
          {/* Traffic lights */}
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
          </div>
          {/* URL bar */}
          <div className="flex-1 flex items-center justify-center">
            <AnimatePresence mode="wait">
              <motion.div
                key={s.url}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-1.5 rounded-md bg-background border border-border/60 px-3 py-1 max-w-[300px] w-full"
              >
                <div className="h-2 w-2 rounded-full bg-success/70 shrink-0" />
                <span className="text-micro text-muted-foreground font-mono truncate">{s.url}</span>
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="w-[52px] shrink-0" />
        </div>

        {/* Page area */}
        <div className="bg-background py-10 px-4 flex flex-col items-center">
          <AnimatePresence mode="wait">
            <InvoiceCard key={s.id} s={s} satsToUsd={satsToUsd} btcPrice={btcPrice} />
          </AnimatePresence>
          <ScenarioDots
            count={SCENARIOS.length}
            active={activeIdx}
            onSelect={setActiveIdx}
          />
        </div>
      </div>

      {/* ── Mobile: card only ─────────────────────────────────────────────────── */}
      <div className="md:hidden flex flex-col items-center px-2">
        <AnimatePresence mode="wait">
          <InvoiceCard key={s.id} s={s} satsToUsd={satsToUsd} btcPrice={btcPrice} />
        </AnimatePresence>
        <ScenarioDots
          count={SCENARIOS.length}
          active={activeIdx}
          onSelect={setActiveIdx}
        />
      </div>
    </motion.div>
  );
}
