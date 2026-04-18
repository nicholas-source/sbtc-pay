import { useState, useMemo } from "react";
import { formatDistanceToNow, startOfDay, startOfWeek, startOfMonth, format } from "date-fns";
import { ArrowUpDown, Search, Copy, Eye, XCircle, Check, FileText, SearchX, CalendarIcon, Pencil } from "lucide-react";
import EmptyState from "@/components/dashboard/EmptyState";
import { cn } from "@/lib/utils";
import { useInvoiceStore, type Invoice, type InvoiceStatus } from "@/stores/invoice-store";
import InvoiceStatusBadge from "./InvoiceStatusBadge";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollableTable } from "@/components/ui/scrollable-table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

import { formatAmount, amountToUsd, tokenLabel } from "@/lib/constants";
import { useLivePrices, useWalletStore } from "@/stores/wallet-store";
import { Loader2 } from "lucide-react";

type SortKey = "id" | "amount" | "createdAt" | "expiresAt" | "status";
type SortDir = "asc" | "desc";

const statusOrder: Record<InvoiceStatus, number> = { pending: 0, partial: 1, paid: 2, refunded: 3, expired: 4, cancelled: 5 };

interface Props {
  onSelect: (invoice: Invoice) => void;
}

export default function InvoiceTable({ onSelect }: Props) {
  const invoices = useInvoiceStore((s) => s.invoices);
  const hasMore = useInvoiceStore((s) => s.hasMore);
  const isFetchingMore = useInvoiceStore((s) => s.isFetchingMore);
  const fetchMoreInvoices = useInvoiceStore((s) => s.fetchMoreInvoices);
  const walletAddress = useWalletStore((s) => s.address);
  const { btcPriceUsd, stxPriceUsd } = useLivePrices();
  const cancelInvoice = useInvoiceStore((s) => s.cancelInvoice);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<"all" | "today" | "week" | "month" | "custom">("all");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  const filtered = useMemo(() => {
    let list = invoices;
    if (statusFilter !== "all") list = list.filter((i) => i.status === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((i) => i.id.toLowerCase().includes(q) || i.memo.toLowerCase().includes(q) || i.referenceId.toLowerCase().includes(q));
    }
    // Date range filter
    const now = new Date();
    if (dateRange === "today") {
      const start = startOfDay(now);
      list = list.filter((i) => i.createdAt >= start);
    } else if (dateRange === "week") {
      const start = startOfWeek(now);
      list = list.filter((i) => i.createdAt >= start);
    } else if (dateRange === "month") {
      const start = startOfMonth(now);
      list = list.filter((i) => i.createdAt >= start);
    } else if (dateRange === "custom") {
      if (customFrom) list = list.filter((i) => i.createdAt >= customFrom);
      if (customTo) {
        const endOfTo = new Date(customTo);
        endOfTo.setHours(23, 59, 59, 999);
        list = list.filter((i) => i.createdAt <= endOfTo);
      }
    }
    return [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "id": cmp = a.id.localeCompare(b.id); break;
        case "amount": cmp = a.amount - b.amount; break;
        case "createdAt": cmp = a.createdAt.getTime() - b.createdAt.getTime(); break;
        case "expiresAt": cmp = (a.expiresAt?.getTime() ?? Infinity) - (b.expiresAt?.getTime() ?? Infinity); break;
        case "status": cmp = statusOrder[a.status] - statusOrder[b.status]; break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [invoices, search, statusFilter, dateRange, customFrom, customTo, sortKey, sortDir]);

  async function copyLink(inv: { id: string; dbId: number }) {
    if (inv.dbId === 0) {
      toast.warning("Payment link not ready yet", {
        description: "This invoice is still confirming on-chain. Try again in a few minutes.",
      });
      return;
    }
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/pay/${inv.dbId}`);
      toast.success("Link copied", { description: `Invoice ${inv.id}` });
    } catch {
      toast.error("Couldn't copy the link. Check your browser permissions.");
    }
  }

  const getSortDirection = (field: SortKey): "ascending" | "descending" | undefined =>
    sortKey === field ? (sortDir === "asc" ? "ascending" : "descending") : undefined;

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <button
      className="inline-flex items-center gap-1 transition-colors hover:text-foreground focus-ring rounded-sm"
      onClick={() => toggleSort(field)}
      aria-sort={getSortDirection(field)}
    >
      {label}
      <ArrowUpDown className={cn("h-3 w-3", sortKey === field ? "text-primary" : "text-muted-foreground/40")} />
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search invoices..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" aria-label="Search invoices" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[140px] md:w-[160px]"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="refunded">Refunded</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={dateRange} onValueChange={(v) => setDateRange(v as typeof dateRange)}>
          <SelectTrigger className="w-full sm:w-[140px] md:w-[160px]"><SelectValue placeholder="All time" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All time</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {dateRange === "custom" && (
        <div className="flex flex-wrap gap-2 items-center">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("flex-1 sm:min-w-[130px] justify-start text-left font-normal", !customFrom && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {customFrom ? format(customFrom, "PP") : "From"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={customFrom} onSelect={setCustomFrom} initialFocus className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
          <span className="text-muted-foreground text-sm">→</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("flex-1 sm:min-w-[130px] justify-start text-left font-normal", !customTo && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {customTo ? format(customTo, "PP") : "To"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={customTo} onSelect={setCustomTo} initialFocus className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={search || statusFilter !== "all" || dateRange !== "all" ? SearchX : FileText}
          title={search || statusFilter !== "all" || dateRange !== "all" ? "No matching invoices" : "No invoices yet"}
          description={search || statusFilter !== "all" || dateRange !== "all" ? "Try adjusting your search or filter criteria." : "Create your first invoice to get started."}
        />
      ) : (
        <ScrollableTable label="Invoices table">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="min-w-[80px]"><SortHeader label="Invoice" field="id" /></TableHead>
                <TableHead className="text-right"><SortHeader label="Amount" field="amount" /></TableHead>
                <TableHead className="hidden md:table-cell">Paid</TableHead>
                <TableHead><SortHeader label="Status" field="status" /></TableHead>
                <TableHead className="hidden lg:table-cell"><SortHeader label="Created" field="createdAt" /></TableHead>
                <TableHead className="hidden lg:table-cell"><SortHeader label="Expires" field="expiresAt" /></TableHead>
                <TableHead className="w-10 sm:w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((inv, i) => {
                const pct = inv.amount > 0 ? Math.round((inv.amountPaid / inv.amount) * 100) : 0;
                return (
                  <tr
                    key={inv.id}
                    className="border-b transition-colors hover:bg-accent/50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                    onClick={() => onSelect(inv)}
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(inv); } }}
                  >
                    <TableCell className="font-mono text-xs">
                      {inv.id}
                      {inv.dbId === 0 && (
                        <span className="ml-1.5 text-micro text-warning" title="Confirming on-chain">⏳</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono font-tabular">
                      <div>{formatAmount(inv.amount, inv.tokenType)} <span className="text-muted-foreground text-micro">{tokenLabel(inv.tokenType)}</span></div>
                      <div className="text-micro text-muted-foreground">${amountToUsd(inv.amount, inv.tokenType, btcPriceUsd, stxPriceUsd)}</div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {inv.status === "paid" ? (
                        <Check className="h-4 w-4 text-success" />
                      ) : (inv.status === "partial" || inv.amountPaid > 0) ? (
                        <span className={cn("text-xs font-mono", inv.status === "expired" ? "text-destructive/70" : "text-info")}>{pct}%</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell><InvoiceStatusBadge status={inv.status} amountPaid={inv.amountPaid} /></TableCell>
                    <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                      {formatDistanceToNow(inv.createdAt, { addSuffix: true })}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                      {inv.expiresAt ? formatDistanceToNow(inv.expiresAt, { addSuffix: true }) : "Never"}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8 focus-ring" aria-label="Invoice actions">
                            <span className="text-lg leading-none">⋯</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem aria-label={`View invoice ${inv.id}`} onClick={(e) => { e.stopPropagation(); onSelect(inv); }}>
                            <Eye className="mr-2 h-4 w-4" />View
                          </DropdownMenuItem>
                          <DropdownMenuItem aria-label={`Copy payment link for ${inv.id}`} onClick={(e) => { e.stopPropagation(); copyLink(inv); }}>
                            <Copy className="mr-2 h-4 w-4" />Copy link
                          </DropdownMenuItem>
                          {inv.status === "pending" && inv.amountPaid === 0 && inv.dbId > 0 && (
                            <DropdownMenuItem aria-label={`Edit invoice ${inv.id}`} onClick={(e) => { e.stopPropagation(); onSelect(inv); }}>
                              <Pencil className="mr-2 h-4 w-4" />Edit
                            </DropdownMenuItem>
                          )}
                          {inv.status === "pending" && (
                            <DropdownMenuItem aria-label={`Cancel invoice ${inv.id}`} className="text-destructive" onClick={async (e) => { e.stopPropagation(); try { await cancelInvoice(inv.id); toast.success("Invoice cancelled"); } catch (err) { toast.error(err instanceof Error ? err.message : "Cancel failed"); } }}>
                              <XCircle className="mr-2 h-4 w-4" />Cancel Invoice
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </tr>
                );
              })}
            </TableBody>
          </Table>
        </ScrollableTable>
      )}

      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={isFetchingMore}
            onClick={() => walletAddress && fetchMoreInvoices(walletAddress)}
          >
            {isFetchingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isFetchingMore ? "Loading…" : "Load more invoices"}
          </Button>
        </div>
      )}
    </div>
  );
}
