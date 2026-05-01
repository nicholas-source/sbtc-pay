import { useState, useEffect, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, ArrowRightLeft, ExternalLink, Layers, RefreshCw, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/lib/supabase/client";
import { getExplorerTxUrl, truncateAddress } from "@/lib/stacks/config";
import { formatAmount, tokenLabel } from "@/lib/constants";
import type { TokenType } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { ScrollableTable } from "@/components/ui/scrollable-table";

interface AdminPaymentRow {
  id: string;
  tokenType: TokenType;
  amount: number;
  merchantReceived: number;
  fee: number;
  payer: string;
  merchantPrincipal: string;
  txId: string | null;
  blockHeight: number;
  createdAt: string;
  invoiceId?: number;
}

export function PlatformPaymentsFeed() {
  const [rows, setRows] = useState<AdminPaymentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tokenFilter, setTokenFilter] = useState<"all" | "sbtc" | "stx">("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await supabase
        .from("payments")
        .select("id, amount, fee, merchant_received, payer, tx_id, block_height, created_at, token_type, invoice_id, merchant_principal")
        .order("block_height", { ascending: false })
        .limit(50);
      setRows(
        (data ?? []).map((r) => ({
          id: `p-${r.id}`,
          tokenType: (r.token_type === "stx" ? "stx" : "sbtc") as TokenType,
          amount: r.amount,
          merchantReceived: r.merchant_received ?? r.amount,
          fee: r.fee ?? 0,
          payer: r.payer,
          merchantPrincipal: r.merchant_principal,
          txId: r.tx_id,
          blockHeight: r.block_height,
          createdAt: r.created_at,
          invoiceId: r.invoice_id,
        }))
      );
    } catch (err) {
      console.error("Failed to load platform payments:", err);
      setError("Failed to load payments. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter((r) => {
    if (tokenFilter !== "all" && r.tokenType !== tokenFilter) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      r.payer.toLowerCase().includes(q) ||
      r.merchantPrincipal.toLowerCase().includes(q) ||
      (r.txId ?? "").toLowerCase().includes(q) ||
      String(r.invoiceId ?? "").includes(q)
    );
  });

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 flex-wrap">
        <div>
          <CardTitle className="text-heading-sm flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4 text-primary" /> Platform Payments
          </CardTitle>
          <p className="text-body-sm text-muted-foreground mt-1">
            Last 50 on-chain payments across all merchants
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Payer, merchant, tx…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-48 sm:w-56"
              aria-label="Search payments"
            />
          </div>
          <div className="flex gap-1" role="group" aria-label="Filter by token">
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
          <Button variant="outline" size="sm" onClick={load} disabled={loading} aria-label="Refresh payments">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 mb-4 text-body-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
        <TooltipProvider delayDuration={200}>
          <ScrollableTable label="Platform payments table">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-16">Token</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead className="hidden sm:table-cell">Received</TableHead>
                  <TableHead className="hidden sm:table-cell">Fee</TableHead>
                  <TableHead className="hidden md:table-cell">Merchant</TableHead>
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
                        <RefreshCw className="h-4 w-4 animate-spin" /> Loading…
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                      <Layers className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p>{rows.length === 0 ? "No payments yet" : "No results for this filter"}</p>
                    </TableCell>
                  </TableRow>
                ) : filtered.map((r) => (
                  <TableRow key={r.id} className="group">
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn("text-micro font-medium",
                          r.tokenType === "stx"
                            ? "border-secondary/40 text-secondary bg-secondary/10"
                            : "border-primary/40 text-primary bg-primary/10"
                        )}
                      >
                        {r.tokenType === "stx" ? "STX" : "sBTC"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono-nums text-body-sm text-foreground">
                        {formatAmount(r.amount, r.tokenType)}
                      </span>
                      <span className="ml-1 text-caption text-muted-foreground">{tokenLabel(r.tokenType)}</span>
                      {r.invoiceId && (
                        <p className="text-micro text-muted-foreground/70">#{r.invoiceId}</p>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span className="font-mono-nums text-body-sm text-success">
                        {formatAmount(r.merchantReceived, r.tokenType)}
                      </span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {r.fee > 0 ? (
                        <span className="font-mono-nums text-caption text-warning">
                          {formatAmount(r.fee, r.tokenType)}
                        </span>
                      ) : (
                        <span className="text-caption text-muted-foreground/40">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <code className="font-mono text-caption text-muted-foreground cursor-default">
                            {truncateAddress(r.merchantPrincipal, 5)}
                          </code>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="font-mono text-micro">{r.merchantPrincipal}</TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <code className="font-mono text-caption text-muted-foreground cursor-default">
                            {truncateAddress(r.payer, 5)}
                          </code>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="font-mono text-micro">{r.payer}</TooltipContent>
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
                ))}
              </TableBody>
            </Table>
          </ScrollableTable>
          {filtered.length > 0 && (
            <p className="text-caption text-muted-foreground pt-2">
              Showing {filtered.length}{filtered.length < rows.length ? ` of ${rows.length}` : rows.length === 50 ? " (50 max)" : ""}
            </p>
          )}
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
