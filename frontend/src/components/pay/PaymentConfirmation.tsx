import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Loader2, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import type { Payment } from "@/stores/invoice-store";
import { formatSbtc } from "@/lib/constants";
import { NETWORK_MODE } from "@/lib/stacks/config";

interface Props {
  payment: Payment | null;
  amount: number;
}

export function PaymentConfirmation({ payment, amount }: Props) {
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (payment) {
      const timer = setTimeout(() => setShowSuccess(true), 800);
      return () => clearTimeout(timer);
    }
  }, [payment]);

  if (!payment || !showSuccess) {
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

  const explorerUrl = payment.txId && payment.txId !== "pending"
    ? `https://explorer.hiro.so/txid/${payment.txId}?chain=${NETWORK_MODE}`
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="flex flex-col items-center gap-6 py-6"
    >
      <motion.div
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
        className="relative"
      >
        {/* Success glow ring */}
        <div className="absolute inset-0 rounded-full" style={{ animation: "successPulse 2s ease-out 0.8s" }} />
        {/* Animated checkmark with draw effect */}
        <svg width="64" height="64" viewBox="0 0 64 64" className="text-success relative">
          <motion.circle
            cx="32" cy="32" r="28"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          />
          <motion.path
            d="M20 32 L28 40 L44 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.4, delay: 0.6 }}
          />
        </svg>
      </motion.div>

      <div className="text-center">
        <p className="text-heading-sm text-success">Payment Confirmed</p>
        <p className="text-sats text-primary mt-2 font-tabular">
          {formatSbtc(amount)} sBTC
        </p>
      </div>

      {payment && (
        <div className="w-full space-y-3 rounded-lg bg-success/5 border border-success/20 p-4 text-body-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Transaction</span>
            <code className="truncate max-w-[180px] text-foreground font-mono text-caption">
              {payment.txId}
            </code>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Time</span>
            <span className="text-foreground">
              {format(payment.timestamp, "MMM d, yyyy HH:mm")}
            </span>
          </div>
        </div>
      )}

      {explorerUrl ? (
        <Button
          variant="ghost"
          className="gap-2 text-muted-foreground"
          asChild
        >
          <a href={explorerUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4" />
            View on Explorer
          </a>
        </Button>
      ) : (
        <Button variant="ghost" className="gap-2 text-muted-foreground" disabled>
          <ExternalLink className="h-4 w-4" />
          View Receipt
        </Button>
      )}
    </motion.div>
  );
}
