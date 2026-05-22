import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  BadgeCheck, Ban, CheckCircle2, ExternalLink, FileWarning, Loader2,
  Pause, Play, PiggyBank, RefreshCw, ScrollText, Shield, UserCheck,
  UserPlus, Wallet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabaseWithWallet } from "@/lib/supabase/client";
import { useWalletStore } from "@/stores/wallet-store";
import { getExplorerTxUrl, truncateAddress } from "@/lib/stacks/config";
import { cn } from "@/lib/utils";

// Event types the contract emits for admin / merchant-lifecycle actions.
// These are surfaced in the audit log; payment-tier events are filtered out
// because PlatformPaymentsFeed already shows those in detail.
const ADMIN_EVENT_TYPES = [
  "merchant-registered",
  "merchant-updated",
  "merchant-verified",
  "merchant-suspended",
  "merchant-unsuspended",
  "merchant-deactivated",
  "merchant-reactivated",
  "platform-fee-updated",
  "fee-recipient-updated",
  "contract-paused",
  "contract-unpaused",
  "ownership-transfer-initiated",
  "ownership-transferred",
  "ownership-transfer-cancelled",
] as const;

type AdminEventType = typeof ADMIN_EVENT_TYPES[number];

interface AuditEntry {
  id: number;
  eventType: AdminEventType;
  payload: Record<string, unknown>;
  txId: string;
  blockHeight: number;
  createdAt: string;
}

// Visual treatment per event type — icon + accent color cluster.
const EVENT_STYLE: Record<AdminEventType, {
  Icon: React.ComponentType<{ className?: string }>;
  iconWrap: string;
}> = {
  "merchant-registered":          { Icon: UserPlus,      iconWrap: "bg-info/15 text-info" },
  "merchant-updated":             { Icon: UserCheck,     iconWrap: "bg-muted text-muted-foreground" },
  "merchant-verified":            { Icon: BadgeCheck,    iconWrap: "bg-success/15 text-success" },
  "merchant-suspended":           { Icon: Ban,           iconWrap: "bg-destructive/15 text-destructive" },
  "merchant-unsuspended":         { Icon: CheckCircle2,  iconWrap: "bg-success/15 text-success" },
  "merchant-deactivated":         { Icon: Ban,           iconWrap: "bg-warning/15 text-warning" },
  "merchant-reactivated":         { Icon: CheckCircle2,  iconWrap: "bg-success/15 text-success" },
  "platform-fee-updated":         { Icon: PiggyBank,     iconWrap: "bg-warning/15 text-warning" },
  "fee-recipient-updated":        { Icon: Wallet,        iconWrap: "bg-warning/15 text-warning" },
  "contract-paused":              { Icon: Pause,         iconWrap: "bg-destructive/15 text-destructive" },
  "contract-unpaused":            { Icon: Play,          iconWrap: "bg-success/15 text-success" },
  "ownership-transfer-initiated": { Icon: Shield,        iconWrap: "bg-warning/15 text-warning" },
  "ownership-transferred":        { Icon: Shield,        iconWrap: "bg-primary/15 text-primary" },
  "ownership-transfer-cancelled": { Icon: Shield,        iconWrap: "bg-muted text-muted-foreground" },
};

// Render the human-readable description for an audit entry, given its
// event_type and indexed payload (Clarity dash-case keys preserved).
function describe(entry: AuditEntry): React.ReactNode {
  const p = entry.payload;
  const merchant = (p.merchant as string | undefined) ?? "";
  const name = (p.name as string | undefined) ?? "";
  switch (entry.eventType) {
    case "merchant-registered":
      return (
        <>
          New merchant registered{name ? <> — <strong>{name}</strong></> : null}
          {merchant && <span className="text-muted-foreground"> ({truncateAddress(merchant)})</span>}
        </>
      );
    case "merchant-updated":
      return (
        <>
          Profile updated{name ? <> — <strong>{name}</strong></> : null}
          {merchant && <span className="text-muted-foreground"> ({truncateAddress(merchant)})</span>}
        </>
      );
    case "merchant-verified":
      return <>Verified <strong>{truncateAddress(merchant)}</strong></>;
    case "merchant-suspended":
      return <>Suspended <strong>{truncateAddress(merchant)}</strong></>;
    case "merchant-unsuspended":
      return <>Reinstated <strong>{truncateAddress(merchant)}</strong></>;
    case "merchant-deactivated":
      return <>Merchant deactivated their own account <span className="text-muted-foreground">({truncateAddress(merchant)})</span></>;
    case "merchant-reactivated":
      return <>Merchant reactivated their own account <span className="text-muted-foreground">({truncateAddress(merchant)})</span></>;
    case "platform-fee-updated": {
      const oldBps = Number(p["old-fee-bps"] ?? 0);
      const newBps = Number(p["new-fee-bps"] ?? 0);
      return (
        <>
          Platform fee changed from <strong>{(oldBps / 100).toFixed(2)}%</strong> to <strong>{(newBps / 100).toFixed(2)}%</strong>
        </>
      );
    }
    case "fee-recipient-updated": {
      const recipient = (p["new-recipient"] as string | undefined) ?? "";
      return <>Fee recipient changed to <strong>{truncateAddress(recipient)}</strong></>;
    }
    case "contract-paused":
      return <>Contract <strong>paused</strong></>;
    case "contract-unpaused":
      return <>Contract <strong>resumed</strong></>;
    case "ownership-transfer-initiated": {
      const newOwner = (p["new-owner"] as string | undefined) ?? "";
      return <>Ownership transfer initiated → <strong>{truncateAddress(newOwner)}</strong></>;
    }
    case "ownership-transferred":
      return <>Ownership transferred to a new principal</>;
    case "ownership-transfer-cancelled":
      return <>Ownership transfer cancelled</>;
  }
}

const PAGE_SIZE = 20;

export function AdminAuditLog() {
  const address = useWalletStore((s) => s.address);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);

  const load = useCallback(async (fetchLimit = limit) => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const db = supabaseWithWallet(address);
      const { data, error: err } = await db
        .from("events")
        .select("id, event_type, payload, tx_id, block_height, processed_at")
        .in("event_type", ADMIN_EVENT_TYPES as unknown as string[])
        .order("block_height", { ascending: false })
        .limit(fetchLimit);
      if (err) throw err;
      setEntries(
        (data ?? []).map((r) => ({
          id: Number(r.id),
          eventType: r.event_type as AdminEventType,
          payload: (r.payload as Record<string, unknown>) ?? {},
          txId: r.tx_id ?? "",
          blockHeight: Number(r.block_height),
          createdAt: r.processed_at ?? new Date().toISOString(),
        }))
      );
    } catch (e) {
      console.error("Failed to load audit log:", e);
      setError("Failed to load audit log. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [address, limit]);

  useEffect(() => { load(); }, [load]);

  // Realtime: surface new admin actions as chainhook indexes them.
  useEffect(() => {
    if (!address) return;
    const client = supabaseWithWallet(address);
    const channel = client
      .channel(`admin-audit-log-${address}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "events" },
        (payload) => {
          const row = payload.new as { event_type?: string };
          // Only refetch if the new event is one we care about; otherwise
          // a heavy payment-firehose period would needlessly thrash.
          if (row.event_type && (ADMIN_EVENT_TYPES as readonly string[]).includes(row.event_type)) {
            load();
          }
        },
      )
      .subscribe();
    return () => { client.removeChannel(channel); };
  }, [address, load]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="text-heading-sm flex items-center gap-2">
            <ScrollText className="h-4 w-4 text-primary" /> Audit Log
          </CardTitle>
          <p className="text-body-sm text-muted-foreground mt-1">
            Every administrative action on the contract, indexed from on-chain events
          </p>
        </div>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => load()}
          disabled={loading}
          aria-label="Refresh audit log"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 mb-4 text-body-sm text-destructive">
            <FileWarning className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
        <TooltipProvider delayDuration={200}>
          {loading && entries.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading audit log…
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <ScrollText className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-body-sm">No administrative actions yet</p>
              <p className="text-caption mt-1">Verifications, suspensions, and config changes will appear here</p>
            </div>
          ) : (
            <ul className="flex flex-col">
              {entries.map((e) => {
                const style = EVENT_STYLE[e.eventType] ?? {
                  Icon: ScrollText,
                  iconWrap: "bg-muted text-muted-foreground",
                };
                const { Icon, iconWrap } = style;
                return (
                  <li
                    key={e.id}
                    className="flex items-start gap-3 py-3 border-b border-border last:border-0"
                  >
                    <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", iconWrap)}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-body-sm text-foreground">{describe(e)}</p>
                      <p className="text-caption text-muted-foreground mt-0.5">
                        {formatDistanceToNow(new Date(e.createdAt), { addSuffix: true })}
                        {" · block "}
                        <span className="font-mono">{e.blockHeight.toLocaleString()}</span>
                      </p>
                    </div>
                    {e.txId && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <a
                            href={getExplorerTxUrl(e.txId)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:bg-accent focus-ring shrink-0"
                            aria-label="View transaction on explorer"
                          >
                            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                          </a>
                        </TooltipTrigger>
                        <TooltipContent side="left">View on explorer</TooltipContent>
                      </Tooltip>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {entries.length === limit && (
            <div className="flex justify-center pt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { const next = limit + PAGE_SIZE; setLimit(next); load(next); }}
                disabled={loading}
              >
                Load more
              </Button>
            </div>
          )}
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
