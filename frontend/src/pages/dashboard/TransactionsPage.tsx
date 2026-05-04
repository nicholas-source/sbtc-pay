import { useState, useEffect, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import { ArrowLeftRight, ExternalLink, Search, RefreshCw, TrendingUp, Bitcoin, Layers } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollableTable } from "@/components/ui/scrollable-table";
import { useWalletStore, useLivePrices } from "@/stores/wallet-store";
import { supabaseWithWallet } from "@/lib/supabase/client";
import { formatAmount, amountToUsd, tokenLabel } from "@/lib/constants";
import { getExplorerTxUrl, truncateAddress } from "@/lib/stacks/config";
import { cn } from "@/lib/utils";
import type { TokenType } from "@/lib/constants";

// ── Types ────────────────────────────────────────────────────────────────────

type TxKind = "invoice" | "direct";

interface TxRow {
  id: string; // "p-{id}" or "d-{id}"
  kind: TxKind;
  tokenType: TokenType;
  amount: number;
  fee: number;
  merchantReceived: number;
  payer: string;
  txId: string | null;
  blockHeight: number;
  createdAt: string;
  invoiceId?: number;
  memo?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

function TokenBadge({ token }: { token: TokenType }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-micro font-medium",
        token === "stx"
          ? "border-secondary/40 text-secondary bg-secondary/10"
          : "border-primary/40 text-primary bg-primary/10"
      )}
    >
      {token === "stx" ? "STX" : "sBTC"}
    </Badge>
  );
}

function KindBadge({ kind }: { kind: TxKind }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-micro",
        kind === "invoice"
          ? "border-info/40 text-info bg-info/10"
          : "border-muted-foreground/30 text-muted-foreground"
      )}
    >
      {kind === "invoice" ? "Invoice" : "Direct"}
    </Badge>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function TransactionsPage() {
  const { address, isAuthenticated } = useWalletStore();
  const { btcPriceUsd, stxPriceUsd } = useLivePrices();

  const [rows, setRows] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState("");
  const [tokenFilter, setTokenFilter] = useState<"all" | "sbtc" | "stx">("all");

  const load = useCallback(async (pageIndex: number) => {
    if (!address || !isAuthenticated) return;
    setLoading(true);
    try {
      const client = supabaseWithWallet(address);
      const from = pageIndex * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const [paymentsRes, directRes] = await Promise.all([
        client
          .from("payments")
          .select("id, amount, fee, merchant_received, payer, tx_id, block_height, created_at, token_type, invoice_id")
          .eq("merchant_principal", address)
          .order("block_height", { ascending: false })
          .range(from, to),
        client
          .from("direct_payments")
          .select("id, amount, fee, merchant_received, payer, tx_id, block_height, created_at, token_type, memo")
          .eq("merchant_principal", address)
          .order("block_height", { ascending: false })
          .range(from, to),
      ]);

      const invoiceRows: TxRow[] = (paymentsRes.data ?? []).map((r) => ({
        id: `p-${r.id}`,
        kind: "invoice",
        tokenType: (r.token_type === "stx" ? "stx" : "sbtc") as TokenType,
        amount: r.amount,
        fee: r.fee ?? 0,
        merchantReceived: r.merchant_received ?? r.amount,
        payer: r.payer,
        txId: r.tx_id,
        blockHeight: r.block_height,
        createdAt: r.created_at,
        invoiceId: r.invoice_id,
      }));

      const directRows: TxRow[] = (directRes.data ?? []).map((r) => ({
        id: `d-${r.id}`,
        kind: "direct",
        tokenType: (r.token_type === "stx" ? "stx" : "sbtc") as TokenType,
        amount: r.amount,
        fee: r.fee ?? 0,
        merchantReceived: r.merchant_received ?? r.amount,
        payer: r.payer,
        txId: r.tx_id,
        blockHeight: r.block_height,
        createdAt: r.created_at,
        memo: r.memo ?? undefined,
      }));

      // Merge and sort by block height descending
      const merged = [...invoiceRows, ...directRows].sort(
        (a, b) => b.blockHeight - a.blockHeight
      );

      setRows(pageIndex === 0 ? merged : (prev) => [...prev, ...merged]);
      // hasMore is true if either table returned a full page — they are independent cursors
      setHasMore(
        (paymentsRes.data?.length ?? 0) >= PAGE_SIZE ||
        (directRes.data?.length ?? 0) >= PAGE_SIZE
      );
    } catch (err) {
      console.error("Failed to load transactions:", err);
    } finally {
      setLoading(false);
    }
  }, [address, isAuthenticated]);

  useEffect(() => {
    setPage(0);
    load(0);
  }, [load]);

  const handleRefresh = () => {
    setPage(0);
    load(0);
  };

  const handleLoadMore = () => {
    const next = page + 1;
    setPage(next);
    load(next);
  };

  // Client-side filter (search + token)
  const filtered = rows.filter((r) => {
    if (tokenFilter !== "all" && r.tokenType !== tokenFilter) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      r.payer.toLowerCase().includes(q) ||
      (r.txId ?? "").toLowerCase().includes(q) ||
      (r.memo ?? "").toLowerCase().includes(q) ||
      String(r.invoiceId ?? "").includes(q)
    );
  });

  // Stat totals across loaded rows (before filter)
  const sbtcRows = rows.filter((r) => r.tokenType === "sbtc");
  const stxRows = rows.filter((r) => r.tokenType === "stx");
  const sbtcVolume = sbtcRows.reduce((s, r) => s + r.merchantReceived, 0);
  const stxVolume = stxRows.reduce((s, r) => s + r.merchantReceived, 0);
  const sbtcFees = sbtcRows.reduce((s, r) => s + r.fee, 0);
  const stxFees = stxRows.reduce((s, r) => s + r.fee, 0);
  const totalUsd =
    (sbtcVolume > 0 ? parseFloat(amountToUsd(sbtcVolume, "sbtc", btcPriceUsd, stxPriceUsd)) || 0 : 0) +
    (stxVolume > 0 ? parseFloat(amountToUsd(stxVolume, "stx", btcPriceUsd, stxPriceUsd)) || 0 : 0);

  return (
    <div className="flex flex-col gap-fluid-lg">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-heading-lg font-display text-foreground flex items-center gap-2">
            <ArrowLeftRight className="h-6 w-6 text-primary" />
            Transactions
          </h1>
          <p className="text-body-sm text-muted-foreground mt-1">
            All on-chain payments received — invoice and direct.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={loading}
          className="gap-2"
          aria-label="Refresh transactions"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-space-md">
        <Card className="card-accent-success animate-fade-slide-up stagger-1">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-body-sm font-medium text-muted-foreground">Net Received</CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/15 text-success">
              <TrendingUp className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="font-mono-nums text-sats text-foreground">
              {[
                sbtcVolume > 0 ? `${formatAmount(sbtcVolume, "sbtc")} sBTC` : "",
                stxVolume > 0 ? `${formatAmount(stxVolume, "stx")} STX` : "",
              ]
                .filter(Boolean)
                .join(" + ") || "0"}
            </div>
            {totalUsd > 0 && (
              <p className="text-caption text-muted-foreground mt-1">≈ ${totalUsd.toFixed(2)}</p>
            )}
          </CardContent>
        </Card>

        <Card className="card-accent-primary animate-fade-slide-up stagger-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-body-sm font-medium text-muted-foreground">sBTC Fees Paid</CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Bitcoin className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="font-mono-nums text-sats text-foreground">
              {sbtcFees > 0 ? `${formatAmount(sbtcFees, "sbtc")} sBTC` : "—"}
            </div>
            <p className="text-caption text-muted-foreground mt-1">Platform fee deducted</p>
          </CardContent>
        </Card>

        <Card className="card-accent-secondary animate-fade-slide-up stagger-3">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-body-sm font-medium text-muted-foreground">STX Fees Paid</CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/15 text-secondary">
              <Layers className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="font-mono-nums text-sats text-foreground">
              {stxFees > 0 ? `${formatAmount(stxFees, "stx")} STX` : "—"}
            </div>
            <p className="text-caption text-muted-foreground mt-1">Platform fee deducted</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search payer, tx ID, memo…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            aria-label="Search transactions"
          />
        </div>
        <div className="flex gap-2" role="group" aria-label="Filter by token">
          {(["all", "sbtc", "stx"] as const).map((t) => (
            <Button
              key={t}
              variant={tokenFilter === t ? "default" : "outline"}
              size="sm"
              onClick={() => setTokenFilter(t)}
              aria-pressed={tokenFilter === t}
              className={cn(
                tokenFilter === t && t === "sbtc" && "bg-primary text-primary-foreground",
                tokenFilter === t && t === "stx" && "bg-secondary text-secondary-foreground"
              )}
            >
              {t === "all" ? "All" : t === "sbtc" ? "sBTC" : "STX"}
            </Button>
          ))}
        </div>
      </div>

      {/* Table */}
      <Card>
        <TooltipProvider delayDuration={200}>
          <ScrollableTable label="Transactions table">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-16">Token</TableHead>
                  <TableHead className="w-20 hidden xs:table-cell">Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead className="hidden sm:table-cell">Received</TableHead>
                  <TableHead className="hidden md:table-cell">Fee</TableHead>
                  <TableHead className="hidden lg:table-cell">Payer</TableHead>
                  <TableHead className="hidden xl:table-cell">Block</TableHead>
                  <TableHead className="hidden md:table-cell">When</TableHead>
                  <TableHead className="w-10 text-right">Tx</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Loading transactions…
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                      <ArrowLeftRight className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p>{rows.length === 0 ? "No transactions yet" : "No results for this filter"}</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((r) => (
                    <TableRow key={r.id} className="group">
                      <TableCell>
                        <TokenBadge token={r.tokenType} />
                      </TableCell>
                      <TableCell className="hidden xs:table-cell">
                        <KindBadge kind={r.kind} />
                      </TableCell>
                      <TableCell>
                        <div>
                          <span className="font-mono-nums text-body-sm text-foreground font-medium">
                            {formatAmount(r.amount, r.tokenType)}
                          </span>
                          <span className="ml-1 text-caption text-muted-foreground">
                            {tokenLabel(r.tokenType)}
                          </span>
                        </div>
                        {r.invoiceId && (
                          <p className="text-micro text-muted-foreground/70">#{r.invoiceId}</p>
                        )}
                        {r.memo && (
                          <p className="text-micro text-muted-foreground/70 max-w-[120px] truncate">{r.memo}</p>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <span className="font-mono-nums text-body-sm text-success">
                          {formatAmount(r.merchantReceived, r.tokenType)}
                        </span>
                        <span className="ml-1 text-caption text-muted-foreground">
                          {tokenLabel(r.tokenType)}
                        </span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <span className="font-mono-nums text-caption text-muted-foreground">
                          {r.fee > 0 ? formatAmount(r.fee, r.tokenType) : "—"}
                        </span>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <code className="font-mono text-caption text-muted-foreground cursor-default">
                              {truncateAddress(r.payer)}
                            </code>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="font-mono text-micro">
                            {r.payer}
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">
                        <span className="font-mono-nums text-caption text-muted-foreground">
                          {r.blockHeight.toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-caption text-muted-foreground">
                        {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.txId ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <a
                                href={getExplorerTxUrl(r.txId)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-accent focus-ring"
                                aria-label="View transaction on explorer"
                              >
                                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                              </a>
                            </TooltipTrigger>
                            <TooltipContent side="left">View on explorer</TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-micro text-muted-foreground/40 px-2">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollableTable>
        </TooltipProvider>

        {hasMore && (
          <div className="flex justify-center p-4 border-t border-border">
            <Button variant="outline" size="sm" onClick={handleLoadMore} disabled={loading}>
              {loading ? (
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Load more
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
