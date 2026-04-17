import { useState, useMemo, useCallback } from "react";
import { format } from "date-fns";
import { RotateCcw, ArrowUpRight, Receipt, Search, Download } from "lucide-react";
import { useInvoiceStore } from "@/stores/invoice-store";
import type { Invoice, Refund } from "@/stores/invoice-store";
import StatCard from "@/components/dashboard/StatCard";
import InvoiceDetail from "@/components/invoice/InvoiceDetail";
import EmptyState from "@/components/dashboard/EmptyState";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollableTable } from "@/components/ui/scrollable-table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { exportToCSV } from "@/lib/export-csv";

import { formatAmount, amountToUsd, tokenLabel } from "@/lib/constants";
import { useLivePrices } from "@/stores/wallet-store";

interface FlatRefund {
  invoiceId: string;
  invoice: Invoice;
  refund: Refund;
}

function RefundsPage() {
  const invoices = useInvoiceStore((s) => s.invoices);
  const { btcPriceUsd, stxPriceUsd } = useLivePrices();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "amount">("date");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

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
    const sbtcAmount = flatRefunds.filter((f) => f.invoice.tokenType !== 'stx').reduce((s, f) => s + f.refund.amount, 0);
    const stxAmount = flatRefunds.filter((f) => f.invoice.tokenType === 'stx').reduce((s, f) => s + f.refund.amount, 0);
    const totalUsd = (sbtcAmount > 0 ? parseFloat(amountToUsd(sbtcAmount, 'sbtc', btcPriceUsd, stxPriceUsd)) || 0 : 0)
      + (stxAmount > 0 ? parseFloat(amountToUsd(stxAmount, 'stx', btcPriceUsd, stxPriceUsd)) || 0 : 0);
    const totalDisplay = [
      sbtcAmount > 0 ? `${formatAmount(sbtcAmount, 'sbtc')} sBTC` : '',
      stxAmount > 0 ? `${formatAmount(stxAmount, 'stx')} STX` : '',
    ].filter(Boolean).join(' + ') || '0';
    const uniqueInvoices = new Set(flatRefunds.map((f) => f.invoiceId)).size;
    return { count: flatRefunds.length, totalDisplay, totalUsd, uniqueInvoices };
  }, [flatRefunds, btcPriceUsd, stxPriceUsd]);

  const handleExport = useCallback(() => {
    const rows = flatRefunds.map((f) => ({
      "Invoice ID": f.invoiceId,
      "Refund Amount (sats)": f.refund.amount,
      Reason: f.refund.reason,
      Date: format(f.refund.timestamp, "yyyy-MM-dd HH:mm"),
      "TX ID": f.refund.txId,
    }));
    exportToCSV(rows, `refunds-${format(new Date(), "yyyy-MM-dd")}.csv`);
  }, [flatRefunds]);

  function handleInvoiceClick(invoice: Invoice) {
    setSelectedInvoice(invoice);
    setDetailOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-heading-lg text-foreground">Refunds</h1>
          <p className="text-body-sm text-muted-foreground mt-1">Track and manage all refund transactions.</p>
        </div>
        {flatRefunds.length > 0 && (
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-1 h-4 w-4" />
            Export CSV
          </Button>
        )}
      </div>

      {flatRefunds.length === 0 ? (
        <EmptyState
          icon={RotateCcw}
          title="No refunds yet"
          description="When you issue refunds on invoices, they'll appear here automatically."
        />
      ) : (
        <>
          {/* Stats */}
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Total Refunds" value={stats.count} displayValue={stats.count.toString()} icon={RotateCcw} change="" accent="destructive" />
            <StatCard label="Total Refunded" value={stats.totalUsd} displayValue={stats.totalDisplay} unit="" usd={stats.totalUsd > 0 ? `$${stats.totalUsd.toFixed(2)}` : ""} icon={ArrowUpRight} change="" accent="warning" />
            <StatCard label="Invoices Affected" value={stats.uniqueInvoices} displayValue={stats.uniqueInvoices.toString()} icon={Receipt} change="" accent="info" />
          </div>

          {/* Controls */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by invoice, reason, or transaction…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as "date" | "amount")}>
              <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="date">Sort by date</SelectItem>
                <SelectItem value="amount">Sort by amount</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          {filtered.length === 0 ? (
              <EmptyState icon={Search} title="No results" description="Try adjusting your search query." />
            ) : (
              <ScrollableTable label="Refunds table">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead className="hidden sm:table-cell">Reason</TableHead>
                      <TableHead className="hidden md:table-cell">Date</TableHead>
                      <TableHead className="hidden lg:table-cell">Transaction</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((f, i) => (
                      <TableRow key={`${f.invoiceId}-${i}`}>
                        <TableCell>
                          <button onClick={() => handleInvoiceClick(f.invoice)} className="font-mono text-sm text-primary transition-colors hover:underline focus-ring rounded-sm">
                            {f.invoiceId}
                          </button>
                        </TableCell>
                        <TableCell>
                          <div className="font-mono font-tabular text-sm">
                            {formatAmount(f.refund.amount, f.invoice.tokenType)} <span className="text-muted-foreground text-xs">{tokenLabel(f.invoice.tokenType)}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">${amountToUsd(f.refund.amount, f.invoice.tokenType, btcPriceUsd, stxPriceUsd)}</div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-sm max-w-[140px] md:max-w-[200px] truncate">{f.refund.reason}</TableCell>
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
              </ScrollableTable>
            )}
        </>
      )}

      <InvoiceDetail invoice={selectedInvoice} open={detailOpen} onOpenChange={setDetailOpen} />
    </div>
  );
}
export default RefundsPage;
