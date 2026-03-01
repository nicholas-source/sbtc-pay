import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Loader2, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import type { Payment } from "@/stores/invoice-store";

interface Props {
  payment: Payment | null;
  amount: number;
}

// Simple confetti particle component
function ConfettiParticle({ delay, x }: { delay: number; x: number }) {
  const colors = ["hsl(25 95% 53%)", "hsl(265 70% 55%)", "hsl(142 71% 45%)", "hsl(38 92% 50%)", "hsl(200 80% 60%)"];
  const color = colors[Math.floor(Math.random() * colors.length)];
  const size = 4 + Math.random() * 6;

  return (
    <motion.div
      initial={{ opacity: 1, y: 0, x: 0, rotate: 0 }}
      animate={{
        opacity: [1, 1, 0],
        y: [0, -80 - Math.random() * 60, 120],
        x: [0, x, x * 1.5],
        rotate: [0, 180 + Math.random() * 360],
      }}
      transition={{ duration: 1.8, delay, ease: "easeOut" }}
      style={{ width: size, height: size, backgroundColor: color, borderRadius: size > 7 ? "50%" : "1px" }}
      className="absolute top-1/2 left-1/2"
    />
  );
}

export function PaymentConfirmation({ payment, amount }: Props) {
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (payment) {
      const timer = setTimeout(() => setConfirmed(true), 2000);
      return () => clearTimeout(timer);
    }
  }, [payment]);

  const formatSats = (sats: number) => sats.toLocaleString();

  if (!confirmed) {
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

  const confettiParticles = Array.from({ length: 24 }, (_, i) => ({
    delay: i * 0.05,
    x: (Math.random() - 0.5) * 200,
  }));

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="flex flex-col items-center gap-6 py-6 relative"
    >
      {/* Confetti */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {confettiParticles.map((p, i) => (
          <ConfettiParticle key={i} delay={p.delay} x={p.x} />
        ))}
      </div>

      <motion.div
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
      >
        {/* Animated checkmark with draw effect */}
        <svg width="64" height="64" viewBox="0 0 64 64" className="text-success">
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
        <p className="text-heading-sm text-foreground">Payment Confirmed</p>
        <p className="text-sats text-gradient-orange mt-2 font-tabular">
          {formatSats(amount)} sats
        </p>
      </div>

      {payment && (
        <div className="w-full space-y-3 rounded-lg bg-muted p-4 text-body-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">TX ID</span>
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

      <Button variant="ghost" className="gap-2 text-muted-foreground" disabled>
        <ExternalLink className="h-4 w-4" />
        View Receipt
      </Button>
    </motion.div>
  );
}
