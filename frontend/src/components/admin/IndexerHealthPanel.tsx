import { useState, useEffect, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import { Activity, AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { supabaseWithWallet } from "@/lib/supabase/client";
import { useWalletStore } from "@/stores/wallet-store";
import { getExplorerTxUrl, API_URL } from "@/lib/stacks/config";
import { cn } from "@/lib/utils";
import { ScrollableTable } from "@/components/ui/scrollable-table";

interface IndexerState {
  /** processed_at of the latest pg_cron heartbeat row — primary aliveness signal. */
  lastHeartbeatAt: string | null;
  /** processed_at of the latest real (non-heartbeat) on-chain event — informational. */
  lastEventBlock: number | null;
  lastEventAt: string | null;
  stacksTip: number | null;
  stacksTipFailed: boolean;
  /** processed_at of the latest reconciliation cron run — proves the on-chain
   *  drift-correction safety net is alive (separate from chain-event aliveness). */
  lastReconcileAt: string | null;
  /** Count of reconcile runs in the last 24h that corrected ≥1 row. A non-zero
   *  number means chainhook missed events that reconcile had to repair — useful
   *  trend signal even when each correction is small. */
  reconcileDriftCount24h: number;
  /** Number of webhook_dlq rows where resolved_at IS NULL. Should be 0 in a
   *  healthy system; any positive count is a "things went silently wrong"
   *  signal (chainhook event handler threw and the row was DLQ'd). */
  dlqUnresolvedCount: number | null;
  recentEvents: Array<{ id: number; event_type: string; tx_id: string; block_height: number; processed_at: string }>;
  loading: boolean;
  error: string | null;
}

export function IndexerHealthPanel() {
  const address = useWalletStore((s) => s.address);
  const [state, setState] = useState<IndexerState>({
    lastHeartbeatAt: null,
    lastEventBlock: null, lastEventAt: null, stacksTip: null, stacksTipFailed: false,
    lastReconcileAt: null, reconcileDriftCount24h: 0,
    dlqUnresolvedCount: null,
    recentEvents: [], loading: true, error: null,
  });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      // Use the wallet-authenticated client — events table requires a JWT
      // (RLS: requesting_wallet_address() IS NOT NULL).
      const db = supabaseWithWallet(address ?? "");
      // 24-hour window for the reconcile drift-count signal.
      const reconcileCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [heartbeatRes, latestEventRes, eventsRes, reconcileRes, dlqRes, infoRes] = await Promise.all([
        // Latest pg_cron heartbeat — primary aliveness signal (time-based)
        db
          .from("events")
          .select("processed_at")
          .eq("event_type", "heartbeat")
          .order("processed_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        // Latest real on-chain event — informational ("last activity X ago").
        // System bookkeeping (heartbeats every 1m, reconciliation every 5m) is
        // excluded; those have their own status pills and would otherwise drown
        // out chain activity on a quiet mainnet.
        db
          .from("events")
          .select("block_height, processed_at")
          .not("event_type", "in", "(heartbeat,reconciliation)")
          .order("block_height", { ascending: false })
          .limit(1)
          .maybeSingle(),
        // Last 20 real chain events — shown in table.
        db
          .from("events")
          .select("id, event_type, tx_id, block_height, processed_at")
          .not("event_type", "in", "(heartbeat,reconciliation)")
          .order("processed_at", { ascending: false })
          .limit(20),
        // All reconciliation runs in the last 24h. We fetch the payload to
        // compute drift count client-side (Supabase REST can't easily express
        // an OR across nested JSON fields). ~288 max rows per day @ 5-min
        // cadence — small enough to ship to the browser without pagination.
        db
          .from("events")
          .select("processed_at, payload")
          .eq("event_type", "reconciliation")
          .gte("processed_at", reconcileCutoff)
          .order("processed_at", { ascending: false }),
        // Unresolved webhook_dlq count — gated by migration 022's RLS policy
        // (admins read-only). On non-admin sessions this returns null silently.
        db
          .from("webhook_dlq")
          .select("*", { count: "exact", head: true })
          .is("resolved_at", null),
        fetch(`${API_URL}/v2/info`).then((r) => r.ok ? r.json() : null).catch(() => null),
      ]);

      const reconciles = reconcileRes.data ?? [];
      // A "drift event" = a reconcile run that corrected ≥1 row in any
      // category (merchants, invoices, subscriptions). 0 corrections = healthy
      // bookkeeping run; >0 = chainhook missed something that reconcile fixed.
      const driftCount = reconciles.filter((r) => {
        const p = (r.payload as { merchants?: { corrected?: number }; invoices?: { corrected?: number }; subscriptions?: { corrected?: number } } | null) ?? null;
        return (
          (p?.merchants?.corrected ?? 0) > 0 ||
          (p?.invoices?.corrected ?? 0) > 0 ||
          (p?.subscriptions?.corrected ?? 0) > 0
        );
      }).length;
      setState({
        lastHeartbeatAt: heartbeatRes.data?.processed_at ?? null,
        lastEventBlock: latestEventRes.data?.block_height ?? null,
        lastEventAt: latestEventRes.data?.processed_at ?? null,
        stacksTip: (infoRes?.stacks_tip_height as number | undefined) ?? null,
        stacksTipFailed: infoRes === null,
        lastReconcileAt: reconciles[0]?.processed_at ?? null,
        reconcileDriftCount24h: driftCount,
        dlqUnresolvedCount: dlqRes.error ? null : (dlqRes.count ?? 0),
        recentEvents: eventsRes.data ?? [],
        loading: false,
        error: null,
      });
    } catch {
      setState((s) => ({ ...s, loading: false, error: "Failed to load indexer data." }));
    }
  }, [address]);

  useEffect(() => { load(); }, [load]);

  // Indexer aliveness is time-based (pg_cron heartbeat), NOT block-height-based.
  // Block-height lag conflates "no on-chain activity" with "indexer broken" —
  // a payments platform can sit idle for hours and still be perfectly healthy.
  // Heartbeat fires every minute via pg_cron, so a fresh heartbeat = alive.
  const heartbeatAgeSec = state.lastHeartbeatAt
    ? Math.max(0, Math.floor((Date.now() - new Date(state.lastHeartbeatAt).getTime()) / 1000))
    : null;

  const lagStatus = heartbeatAgeSec === null
    ? (state.stacksTipFailed ? "unknown" : "unknown")
    : heartbeatAgeSec <= 120 ? "healthy"   // 1 expected tick + small drift
    : heartbeatAgeSec <= 600 ? "warning"   // 10 min — pg_cron may have skipped
    : "critical";                          // > 10 min — indexer DB layer is stuck

  const lagLabel = lagStatus === "healthy" ? "Live"
    : lagStatus === "warning" ? `Heartbeat ${Math.round(heartbeatAgeSec! / 60)}m old`
    : lagStatus === "critical" ? `Indexer offline — heartbeat ${Math.round(heartbeatAgeSec! / 60)}m old`
    : state.stacksTipFailed ? "Stacks API unavailable"
    : "No heartbeats yet";

  const lagColor: Record<string, string> = {
    healthy: "text-success border-success/30 bg-success/10",
    warning: "text-warning border-warning/30 bg-warning/10",
    critical: "text-destructive border-destructive/30 bg-destructive/10",
    unknown: "text-muted-foreground border-border bg-muted/10",
  };

  // Reconcile cron fires every 5 minutes. Healthy = a run within the last 10 min
  // (one missed tick tolerated). Drift count > 0 = chainhook missed events that
  // the safety net repaired — surface as a warning, not critical (the system
  // self-healed; this is signal, not failure).
  const reconcileAgeSec = state.lastReconcileAt
    ? Math.max(0, Math.floor((Date.now() - new Date(state.lastReconcileAt).getTime()) / 1000))
    : null;
  const reconcileStatus =
    reconcileAgeSec === null ? "unknown"
    : reconcileAgeSec > 900 ? "critical"  // > 15 min: cron likely broken
    : state.reconcileDriftCount24h > 0 ? "warning"
    : "healthy";
  const reconcileLabel =
    reconcileAgeSec === null ? "Reconcile: no data yet"
    : reconcileStatus === "critical" ? `Reconcile stale · ${Math.round(reconcileAgeSec / 60)}m ago`
    : reconcileStatus === "warning" ? `Reconcile · ${formatDistanceToNow(new Date(state.lastReconcileAt!), { addSuffix: true })} · ${state.reconcileDriftCount24h} drift${state.reconcileDriftCount24h === 1 ? "" : "s"} (24h)`
    : `Reconcile · ${formatDistanceToNow(new Date(state.lastReconcileAt!), { addSuffix: true })} · 0 drifts (24h)`;

  // DLQ pill: 0 = empty (green), >0 = something's wrong (critical), null = no
  // read access (not an admin) so we hide the pill entirely.
  const dlqStatus =
    state.dlqUnresolvedCount === null ? "hidden"
    : state.dlqUnresolvedCount === 0 ? "healthy"
    : "critical";
  const dlqLabel =
    state.dlqUnresolvedCount === 0 ? "DLQ empty"
    : `DLQ: ${state.dlqUnresolvedCount} unresolved`;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
        <div>
          <CardTitle className="text-heading-sm flex items-center gap-2">
            <Activity className="h-4 w-4 text-info" /> Indexer Health
          </CardTitle>
          <p className="text-body-sm text-muted-foreground mt-1">
            Chainhook event ingestion status — last 20 events
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={state.loading} className="gap-2" aria-label="Refresh indexer health">
          <RefreshCw className={cn("h-4 w-4", state.loading && "animate-spin")} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-space-md">
        {state.error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-body-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {state.error}
          </div>
        )}
        {/* Status summary row */}
        <div className="flex flex-wrap gap-3">
          <div className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-body-sm font-medium", lagColor[lagStatus])}>
            <span className="relative flex h-2 w-2">
              {lagStatus === "healthy" && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />}
              <span className={cn("relative inline-flex h-2 w-2 rounded-full",
                lagStatus === "healthy" ? "bg-success" : lagStatus === "warning" ? "bg-warning" : lagStatus === "critical" ? "bg-destructive" : "bg-muted-foreground"
              )} />
            </span>
            {lagLabel}
          </div>
          <div className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-body-sm font-medium", lagColor[reconcileStatus])}>
            <span className="relative inline-flex h-2 w-2 rounded-full" aria-hidden>
              <span className={cn("inline-flex h-2 w-2 rounded-full",
                reconcileStatus === "healthy" ? "bg-success" : reconcileStatus === "warning" ? "bg-warning" : reconcileStatus === "critical" ? "bg-destructive" : "bg-muted-foreground"
              )} />
            </span>
            {reconcileLabel}
          </div>
          {dlqStatus !== "hidden" && (
            <div className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-body-sm font-medium", lagColor[dlqStatus])}>
              <span className="relative inline-flex h-2 w-2 rounded-full" aria-hidden>
                <span className={cn("inline-flex h-2 w-2 rounded-full",
                  dlqStatus === "healthy" ? "bg-success" : "bg-destructive"
                )} />
              </span>
              {dlqLabel}
            </div>
          )}
          {state.stacksTip && (
            <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-body-sm text-muted-foreground">
              Stacks tip: <span className="font-mono-nums text-foreground ml-1">{state.stacksTip.toLocaleString()}</span>
            </div>
          )}
          {state.lastEventBlock && (
            <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-body-sm text-muted-foreground">
              Last indexed: <span className="font-mono-nums text-foreground ml-1">{state.lastEventBlock.toLocaleString()}</span>
              {state.lastEventAt && (
                <span className="text-caption ml-1">
                  ({formatDistanceToNow(new Date(state.lastEventAt), { addSuffix: true })})
                </span>
              )}
            </div>
          )}
        </div>

        {/* Recent events table */}
        {state.recentEvents.length > 0 && (
          <ScrollableTable label="Recent indexer events">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Event</TableHead>
                  <TableHead className="hidden md:table-cell">Block</TableHead>
                  <TableHead className="hidden lg:table-cell">Processed</TableHead>
                  <TableHead className="w-10 text-right">Tx</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.recentEvents.map((ev) => (
                  <TableRow key={ev.id}>
                    <TableCell>
                      <code className="font-mono text-caption text-foreground">{ev.event_type}</code>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="font-mono-nums text-caption text-muted-foreground">
                        {ev.block_height.toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-caption text-muted-foreground">
                      {formatDistanceToNow(new Date(ev.processed_at), { addSuffix: true })}
                    </TableCell>
                    <TableCell className="text-right">
                      {ev.event_type !== "heartbeat" ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <a
                              href={getExplorerTxUrl(ev.tx_id)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-accent focus-ring"
                              aria-label="View transaction on explorer"
                            >
                              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
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
        )}

        {!state.loading && state.recentEvents.length === 0 && (
          <p className="text-body-sm text-muted-foreground text-center py-6">No events indexed yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
