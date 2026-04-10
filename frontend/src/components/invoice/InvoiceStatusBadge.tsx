import { cn } from "@/lib/utils";
import type { InvoiceStatus } from "@/stores/invoice-store";

const config: Record<InvoiceStatus, { label: string; dot: string; bg: string; text: string }> = {
  paid: { label: "Paid", dot: "bg-success", bg: "bg-success/20", text: "text-success" },
  pending: { label: "Pending", dot: "bg-warning", bg: "bg-warning/20", text: "text-warning" },
  partial: { label: "Partial", dot: "bg-info", bg: "bg-info/20", text: "text-info" },
  expired: { label: "Expired", dot: "bg-destructive", bg: "bg-destructive/20", text: "text-destructive" },
  cancelled: { label: "Cancelled", dot: "bg-muted-foreground", bg: "bg-muted/50", text: "text-muted-foreground" },
  refunded: { label: "Refunded", dot: "bg-secondary", bg: "bg-secondary/20", text: "text-secondary" },
};

interface Props {
  status: InvoiceStatus;
  className?: string;
  /** When > 0 on an expired invoice, shows "Expired · Partial" compound badge */
  amountPaid?: number;
}

export default function InvoiceStatusBadge({ status, className, amountPaid = 0 }: Props) {
  const isExpiredWithPayment = status === "expired" && amountPaid > 0;
  const c = config[status] ?? config.pending;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", c.bg, c.text, className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", c.dot)} />
      {isExpiredWithPayment ? (
        <>
          Expired{" "}
          <span className="opacity-60">·</span>{" "}
          <span className="text-info">Partial</span>
        </>
      ) : c.label}
    </span>
  );
}
