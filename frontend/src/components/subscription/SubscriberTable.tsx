import { Fragment, useState, useMemo, useEffect } from "react";
import { format } from "date-fns";
import { ChevronDown, MoreHorizontal, Pause, Play, RefreshCw, Search, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious,
} from "@/components/ui/pagination";
import { useSubscriptionStore, type SubscriberStatus } from "@/stores/subscription-store";
import { formatSbtc } from "@/lib/constants";

const PAGE_SIZE = 10;

const statusStyles: Record<SubscriberStatus, string> = {
  active: "bg-success/15 text-success border-success/30",
  paused: "bg-warning/15 text-warning border-warning/30",
  cancelled: "bg-destructive/15 text-destructive border-destructive/30",
};

function truncateAddr(addr: string) {
  return addr.length > 16 ? `${addr.slice(0, 8)}…${addr.slice(-6)}` : addr;
}

function truncateTx(tx: string) {
  return tx.length > 16 ? `${tx.slice(0, 10)}…${tx.slice(-6)}` : tx;
}

interface Props {
  planId: string;
}

export default function SubscriberTable({ planId }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | SubscriberStatus>("all");
  const [currentPage, setCurrentPage] = useState(1);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  const allSubscribers = useSubscriptionStore((s) => s.subscribers);
  const subscribers = useMemo(
    () => allSubscribers.filter((sub) => sub.planId === planId),
    [allSubscribers, planId]
  );

  const filteredSubscribers = useMemo(() => {
    let result = subscribers;
    if (statusFilter !== "all") {
      result = result.filter((s) => s.status === statusFilter);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((s) => s.payerAddress.toLowerCase().includes(q));
    }
    return result;
  }, [subscribers, statusFilter, searchQuery]);

  const pauseRaw = useSubscriptionStore((s) => s.pauseSubscription);
  const resumeRaw = useSubscriptionStore((s) => s.resumeSubscription);
  const cancelRaw = useSubscriptionStore((s) => s.cancelSubscription);
  const processRenewal = useSubscriptionStore((s) => s.processRenewal);
  const pendingTxIds = useSubscriptionStore((s) => s.pendingTxIds);

  const pause = async (id: string) => { try { await pauseRaw(id); toast.success("Subscription paused"); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to pause"); } };
  const resume = async (id: string) => { try { await resumeRaw(id); toast.success("Subscription resumed"); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to resume"); } };
  const cancel = async (id: string) => { try { await cancelRaw(id); toast.success("Subscription cancelled"); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to cancel"); } };

  const totalPages = Math.max(1, Math.ceil(filteredSubscribers.length / PAGE_SIZE));
  const paginatedSubscribers = filteredSubscribers.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const goToPage = (page: number) => {
    setCurrentPage(page);
    setExpanded(new Set());
  };

  const getPageNumbers = () => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | "ellipsis")[] = [1];
    if (currentPage > 3) pages.push("ellipsis");
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
      pages.push(i);
    }
    if (currentPage < totalPages - 2) pages.push("ellipsis");
    pages.push(totalPages);
    return pages;
  };

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleRenewal = async (subId: string) => {
    try {
      await processRenewal(subId);
      toast.success("Renewal payment submitted on-chain");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to process renewal");
    }
  };

  if (subscribers.length === 0) {
    return <p className="text-body-sm text-muted-foreground py-4 text-center">No subscribers yet.</p>;
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | SubscriberStatus)}>
          <SelectTrigger className="w-[140px] h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-success" />
                Active
              </span>
            </SelectItem>
            <SelectItem value="paused">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-warning" />
                Paused
              </span>
            </SelectItem>
            <SelectItem value="cancelled">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-destructive" />
                Cancelled
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filteredSubscribers.length === 0 ? (
        <p className="text-body-sm text-muted-foreground py-4 text-center">No matching subscribers.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Address</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Started</TableHead>
                <TableHead className="hidden sm:table-cell">Next Payment</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedSubscribers.map((sub) => {
                const isOpen = expanded.has(sub.id);
                const sortedPayments = [...sub.payments].sort(
                  (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                );

                return (
                  <Fragment key={sub.id}>
                    <TableRow
                      className="cursor-pointer"
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleExpanded(sub.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleExpanded(sub.id);
                        }
                      }}
                    >
                      <TableCell className="pr-0">
                        <ChevronDown
                          className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-body-sm">{truncateAddr(sub.payerAddress)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusStyles[sub.status]}>
                          {sub.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-body-sm text-muted-foreground hidden sm:table-cell">
                        {format(sub.startedAt, "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="text-body-sm text-muted-foreground hidden sm:table-cell">
                        {sub.status === "cancelled" ? "—" : format(sub.nextPaymentAt, "MMM d, yyyy")}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {sub.status !== "cancelled" && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Subscription actions" disabled={pendingTxIds.has(sub.id)}>
                                {pendingTxIds.has(sub.id) ? (
                                  <RefreshCw className="h-4 w-4 animate-spin" />
                                ) : (
                                  <MoreHorizontal className="h-4 w-4" />
                                )}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {sub.status === "active" && (
                                <DropdownMenuItem aria-label="Process renewal payment" onClick={() => handleRenewal(sub.id)}>
                                  <RefreshCw className="mr-2 h-4 w-4" /> Process Renewal
                                </DropdownMenuItem>
                              )}
                              {sub.status === "active" ? (
                                <DropdownMenuItem aria-label="Pause subscription" onClick={() => pause(sub.id)}>
                                  <Pause className="mr-2 h-4 w-4" /> Pause
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem aria-label="Resume subscription" onClick={() => resume(sub.id)}>
                                  <Play className="mr-2 h-4 w-4" /> Resume
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                aria-label="Cancel subscription"
                                className="text-destructive focus:text-destructive"
                                onClick={() => cancel(sub.id)}
                              >
                                <XCircle className="mr-2 h-4 w-4" /> Cancel
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>

                    {isOpen && (
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableCell colSpan={6} className="p-0">
                          <div className="px-6 py-3">
                            {sortedPayments.length === 0 ? (
                              <p className="text-body-sm text-muted-foreground text-center py-2">No payments recorded.</p>
                            ) : (
                              <div className="space-y-1">
                                <p className="text-body-sm font-medium text-muted-foreground mb-2">Payment History</p>
                                <div className="grid grid-cols-3 gap-4 text-body-sm text-muted-foreground font-medium px-2">
                                  <span>Date</span>
                                  <span>Amount</span>
                                  <span>TX ID</span>
                                </div>
                                {sortedPayments.map((p) => (
                                  <div key={p.txId} className="grid grid-cols-3 gap-4 text-body-sm px-2 py-1 rounded hover:bg-muted/50">
                                    <span>{format(p.timestamp, "MMM d, yyyy HH:mm")}</span>
                                    <span>{formatSbtc(p.amount)} sBTC</span>
                                    <span className="font-mono text-muted-foreground" title={p.txId}>
                                      {truncateTx(p.txId)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-3">
              <p className="text-body-sm text-muted-foreground">
                Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredSubscribers.length)} of {filteredSubscribers.length} subscribers
              </p>
              <Pagination className="mx-0 w-auto">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => currentPage > 1 && goToPage(currentPage - 1)}
                      className={currentPage <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                  {getPageNumbers().map((page, idx) =>
                    page === "ellipsis" ? (
                      <PaginationItem key={`ellipsis-${idx}`}>
                        <PaginationEllipsis />
                      </PaginationItem>
                    ) : (
                      <PaginationItem key={page}>
                        <PaginationLink
                          isActive={page === currentPage}
                          onClick={() => goToPage(page as number)}
                          className="cursor-pointer"
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    )
                  )}
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => currentPage < totalPages && goToPage(currentPage + 1)}
                      className={currentPage >= totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </>
      )}
    </div>
  );
}
