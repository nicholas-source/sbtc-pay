import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { RotateCcw, ArrowUpRight, Receipt, Search } from "lucide-react";
import { useInvoiceStore } from "@/stores/invoice-store";
import type { Invoice, Refund } from "@/stores/invoice-store";
import StatCard from "@/components/dashboard/StatCard";
import InvoiceDetail from "@/components/invoice/InvoiceDetail";
import EmptyState from "@/components/dashboard/EmptyState";
import RefundsSkeleton from "@/components/dashboard/RefundsSkeleton";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StaggerContainer, StaggerItem } from "@/components/layout/PageTransition";

import { BTC_USD } from "@/lib/constants";

interface FlatRefund {
  invoiceId: string;
  invoice: Invoice;
  refund: Refund;
}

function RefundsPage() {
  const invoices = useInvoiceStore((s) => s.invoices);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "amount">("date");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  const flatRefunds = useMemo(() => {
    const all: FlatRefund[] = [];
    for (const inv of invoices) {
      for (const r of inv.refunds) {
        all.push({ invoiceId: inv.id, invoice: inv, refund: r });
      }
    }
    return all;
  }, [invoices]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let list = q
      ? flatRefunds.filter(
          (f) =>
            f.invoiceId.toLowerCase().includes(q) ||
            f.refund.reason.toLowerCase().includes(q) ||
            f.refund.txId.toLowerCase().includes(q)
        )
      : flatRefunds;

    list = [...list].sort((a, b) =>
      sortBy === "date"
        ? b.refund.timestamp.getTime() - a.refund.timestamp.getTime()
        : b.refund.amount - a.refund.amount
    );
    return list;
  }, [flatRefunds, search, sortBy]);

  const stats = useMemo(() => {
    const totalAmount = flatRefunds.reduce((s, f) => s + f.refund.amount, 0);
    const uniqueInvoices = new Set(flatRefunds.map((f) => f.invoiceId)).size;
    return { count: flatRefunds.length, totalAmount, uniqueInvoices };
  }, [flatRefunds]);

  function handleInvoiceClick(invoice: Invoice) {
    setSelectedInvoice(invoice);
    setDetailOpen(true);
  }

  if (isLoading) return <RefundsSkeleton />;

  return (
    <StaggerContainer className="space-y-6">
      <StaggerItem>
        <h1 className="text-heading-lg text-foreground">Refunds</h1>
        <p className="text-body-sm text-muted-foreground mt-1">Track and manage all refund transactions.</p>
      </StaggerItem>

      {flatRefunds.length === 0 ? (
        <StaggerItem>
          <EmptyState
            icon={RotateCcw}
            title="No refunds yet"
            description="When you issue refunds on invoices, they'll appear here automatically."
          />
        </StaggerItem>
      ) : (
        <>
          {/* Stats */}
          <div className="grid gap-4 sm:grid-cols-3">
            <StaggerItem>
              <StatCard label="Total Refunds" value={stats.count} displayValue={stats.count.toString()} icon={RotateCcw} change="" />
            </StaggerItem>
            <StaggerItem>
              <StatCard label="Total Refunded" value={stats.totalAmount} displayValue={stats.totalAmount.toLocaleString()} unit="sats" usd={`$${(stats.totalAmount * BTC_USD).toFixed(2)}`} icon={ArrowUpRight} change="" />
            </StaggerItem>
            <StaggerItem>
              <StatCard label="Invoices Affected" value={stats.uniqueInvoices} displayValue={stats.uniqueInvoices.toString()} icon={Receipt} change="" />
            </StaggerItem>
          </div>

          {/* Controls */}
          <StaggerItem>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search by invoice, reason, or TX ID…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as "date" | "amount")}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="date">Sort by date</SelectItem>
                  <SelectItem value="amount">Sort by amount</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </StaggerItem>

          {/* Table */}
          <StaggerItem>
            {filtered.length === 0 ? (
              <EmptyState icon={Search} title="No results" description="Try adjusting your search query." />
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead className="hidden sm:table-cell">Reason</TableHead>
                      <TableHead className="hidden md:table-cell">Date</TableHead>
                      <TableHead className="hidden lg:table-cell">TX ID</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((f, i) => (
                      <TableRow key={`${f.invoiceId}-${i}`}>
                        <TableCell>
                          <button onClick={() => handleInvoiceClick(f.invoice)} className="font-mono text-sm text-primary hover:underline">
                            {f.invoiceId}
                          </button>
                        </TableCell>
                        <TableCell>
                          <div className="font-mono font-tabular text-sm">
                            {f.refund.amount.toLocaleString()} <span className="text-muted-foreground text-xs">sats</span>
                          </div>
                          <div className="text-xs text-muted-foreground">${(f.refund.amount * BTC_USD).toFixed(2)}</div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-sm">{f.refund.reason}</TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                          {format(f.refund.timestamp, "MMM d, yyyy HH:mm")}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <span className="font-mono text-xs text-muted-foreground">{f.refund.txId.slice(0, 10)}…</span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </StaggerItem>
        </>
      )}

      <InvoiceDetail invoice={selectedInvoice} open={detailOpen} onOpenChange={setDetailOpen} />
    </StaggerContainer>
  );
}
export default RefundsPage;
