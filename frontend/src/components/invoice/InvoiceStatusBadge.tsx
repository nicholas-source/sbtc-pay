import { cn } from "@/lib/utils";
import type { InvoiceStatus } from "@/stores/invoice-store";

const config: Record<InvoiceStatus, { label: string; dot: string; bg: string; text: string }> = {
  paid: { label: "Paid", dot: "bg-emerald-400", bg: "bg-emerald-400/10", text: "text-emerald-400" },
  pending: { label: "Pending", dot: "bg-amber-400", bg: "bg-amber-400/10", text: "text-amber-400" },
  partial: { label: "Partial", dot: "bg-sky-400", bg: "bg-sky-400/10", text: "text-sky-400" },
  expired: { label: "Expired", dot: "bg-red-400", bg: "bg-red-400/10", text: "text-red-400" },
  cancelled: { label: "Cancelled", dot: "bg-muted-foreground", bg: "bg-muted/50", text: "text-muted-foreground" },
  refunded: { label: "Refunded", dot: "bg-violet-400", bg: "bg-violet-400/10", text: "text-violet-400" },
};

export default function InvoiceStatusBadge({ status, className }: { status: InvoiceStatus; className?: string }) {
  const c = config[status] ?? config.pending;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", c.bg, c.text, className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", c.dot)} />
      {c.label}
    </span>
  );
}
