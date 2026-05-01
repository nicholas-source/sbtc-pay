import { useState, useEffect, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import { Activity, AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/lib/supabase/client";
import { getExplorerTxUrl, API_URL } from "@/lib/stacks/config";
import { cn } from "@/lib/utils";
import { ScrollableTable } from "@/components/ui/scrollable-table";

interface IndexerState {
  lastEventBlock: number | null;
  lastEventAt: string | null;
  stacksTip: number | null;
  stacksTipFailed: boolean;
  recentEvents: Array<{ id: number; event_type: string; tx_id: string; block_height: number; processed_at: string }>;
  loading: boolean;
  error: string | null;
}

export function IndexerHealthPanel() {
  const [state, setState] = useState<IndexerState>({
    lastEventBlock: null, lastEventAt: null, stacksTip: null, stacksTipFailed: false,
    recentEvents: [], loading: true, error: null,
  });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const [heartbeatRes, eventsRes, infoRes] = await Promise.all([
        // Latest heartbeat — used for lag calculation, not shown in table
        supabase
          .from("events")
          .select("block_height, processed_at")
          .eq("event_type", "heartbeat")
          .order("block_height", { ascending: false })
          .limit(1)
          .maybeSingle(),
        // Last 20 real tx events — shown in table (heartbeats excluded)
        supabase
          .from("events")
          .select("id, event_type, tx_id, block_height, processed_at")
          .neq("event_type", "heartbeat")
          .order("processed_at", { ascending: false })
          .limit(20),
        fetch(`${API_URL}/v2/info`).then((r) => r.ok ? r.json() : null).catch(() => null),
      ]);
      const heartbeat = heartbeatRes.data ?? null;
      setState({
        lastEventBlock: heartbeat?.block_height ?? null,
        lastEventAt: heartbeat?.processed_at ?? null,
        stacksTip: (infoRes?.stacks_tip_height as number | undefined) ?? null,
        stacksTipFailed: infoRes === null,
        recentEvents: eventsRes.data ?? [],
        loading: false,
        error: null,
      });
    } catch {
      setState((s) => ({ ...s, loading: false, error: "Failed to load indexer data." }));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Stacks blocks ~5s post-Nakamoto — lag in blocks vs current tip
  // This correctly measures indexer staleness regardless of activity level
  const lag = state.stacksTip && state.lastEventBlock
    ? state.stacksTip - state.lastEventBlock
    : null;

  const lagStatus = lag === null ? "unknown"
    : lag <= 120 ? "healthy"      // ≤ ~10 min
    : lag <= 720 ? "warning"      // ≤ ~1 hour
    : "critical";

  const lagLabel = lagStatus === "healthy" ? "Live"
    : lagStatus === "warning" ? `~${Math.round(lag! * 5 / 60)} min behind`
    : lagStatus === "critical" ? `~${Math.round(lag! * 5 / 3600)}h behind — check chainhook`
    : state.stacksTipFailed ? "Stacks API unavailable"
    : "No heartbeats yet";

  const lagColor: Record<string, string> = {
    healthy: "text-success border-success/30 bg-success/10",
    warning: "text-warning border-warning/30 bg-warning/10",
    critical: "text-destructive border-destructive/30 bg-destructive/10",
    unknown: "text-muted-foreground border-border bg-muted/10",
  };

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
