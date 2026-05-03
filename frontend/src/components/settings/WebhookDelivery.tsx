import { useState, useEffect, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Webhook, KeyRound, Send, RefreshCw, Copy, AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabaseWithWallet } from "@/lib/supabase/client";
import { useMerchantStore } from "@/stores/merchant-store";

type DeliveryStatus = "pending" | "delivered" | "failed" | "dead";

interface DeliveryRow {
  id: number;
  event_type: string;
  tx_id: string | null;
  status: DeliveryStatus;
  attempts: number;
  last_status_code: number | null;
  last_error: string | null;
  last_attempted_at: string | null;
  delivered_at: string | null;
  created_at: string;
}

const STATUS_CONFIG: Record<DeliveryStatus, { label: string; className: string }> = {
  pending:   { label: "Pending",   className: "bg-warning/15 text-warning border-warning/30" },
  delivered: { label: "Delivered", className: "bg-success/15 text-success border-success/30" },
  failed:    { label: "Retrying",  className: "bg-warning/15 text-warning border-warning/30" },
  dead:      { label: "Failed",    className: "bg-destructive/15 text-destructive border-destructive/30" },
};

export default function WebhookDelivery() {
  const { profile } = useMerchantStore();
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [loadingDeliveries, setLoadingDeliveries] = useState(false);
  const [sending, setSending] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  const hasWebhookUrl = Boolean(profile?.webhookUrl);

  const merchantId = profile?.id;
  const callAdmin = useCallback(async <T,>(action: string): Promise<T> => {
    if (!merchantId) throw new Error("No merchant profile loaded");
    const { data, error } = await supabaseWithWallet(merchantId).functions.invoke<T>(
      "merchant-webhook-admin",
      { body: { action } },
    );
    if (error) throw new Error(error.message);
    return data as T;
  }, [merchantId]);

  const loadDeliveries = useCallback(async () => {
    setLoadingDeliveries(true);
    try {
      const res = await callAdmin<{ deliveries: DeliveryRow[] }>("get-deliveries");
      setDeliveries(res.deliveries ?? []);
    } catch (err) {
      // Silently skip — likely no auth yet or table doesn't exist in dev
      console.warn("Failed to load webhook deliveries:", err);
    } finally {
      setLoadingDeliveries(false);
    }
  }, [callAdmin]);

  useEffect(() => {
    if (profile?.id) loadDeliveries();
  }, [profile?.id, loadDeliveries]);

  // Poll every 5s while the page is visible so new deliveries show up without
  // a manual refresh. Skips polling when the tab is hidden to avoid wasting
  // requests on backgrounded tabs.
  useEffect(() => {
    if (!profile?.id) return;
    const interval = setInterval(() => {
      if (!document.hidden) loadDeliveries();
    }, 5000);
    return () => clearInterval(interval);
  }, [profile?.id, loadDeliveries]);

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const res = await callAdmin<{ secret: string }>("regenerate-secret");
      setNewSecret(res.secret);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to regenerate secret";
      toast.error(msg);
    } finally {
      setRegenerating(false);
    }
  };

  const handleSendTest = async () => {
    if (!hasWebhookUrl) {
      toast.error("Set a Webhook URL in Profile Details first");
      return;
    }
    setSending(true);
    try {
      await callAdmin("send-test");
      toast.success("Test event queued — refreshing log in a moment");
      setTimeout(() => loadDeliveries(), 2000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send test event";
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  const copySecret = async () => {
    if (!newSecret) return;
    try {
      await navigator.clipboard.writeText(newSecret);
      toast.success("Secret copied to clipboard");
    } catch {
      toast.error("Couldn't copy — select and copy manually");
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-heading-sm flex items-center gap-2">
            <Webhook className="h-5 w-5" /> Webhook Delivery
          </CardTitle>
          <CardDescription>
            sBTC Pay POSTs signed events to your Webhook URL when on-chain activity happens. Verify
            signatures with your secret to confirm authenticity.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-space-md">
          {!hasWebhookUrl && (
            <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/5 p-3 text-body-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning" />
              <div className="flex-1">
                <p className="font-medium text-foreground">No webhook URL configured yet</p>
                <p className="mt-1 text-caption text-muted-foreground">
                  Set your Webhook URL in Profile Details above and save to start receiving events.
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-space-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1">
              <p className="text-body-sm font-medium text-foreground">Signing secret</p>
              <p className="text-caption text-muted-foreground">
                Used to HMAC-sign every webhook. Rotate if you suspect compromise.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={handleRegenerate} disabled={regenerating}>
              {regenerating ? <RefreshCw className="mr-1 h-3 w-3 animate-spin" /> : <KeyRound className="mr-1 h-3 w-3" />}
              Regenerate Secret
            </Button>
          </div>

          <Separator />

          <div className="flex flex-col gap-space-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1">
              <p className="text-body-sm font-medium text-foreground">Send a test event</p>
              <p className="text-caption text-muted-foreground">
                Fires a <code className="font-mono">test.ping</code> event to your endpoint so you can verify your setup.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={handleSendTest} disabled={sending || !hasWebhookUrl}>
              {sending ? <RefreshCw className="mr-1 h-3 w-3 animate-spin" /> : <Send className="mr-1 h-3 w-3" />}
              Send Test
            </Button>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <p className="text-body-sm font-medium text-foreground">Recent deliveries</p>
            <Button variant="ghost" size="sm" onClick={loadDeliveries} disabled={loadingDeliveries}>
              <RefreshCw className={`h-3 w-3 ${loadingDeliveries ? "animate-spin" : ""}`} />
              <span className="ml-1">Refresh</span>
            </Button>
          </div>

          {deliveries.length === 0 ? (
            <p className="py-4 text-center text-body-sm text-muted-foreground">
              {loadingDeliveries ? "Loading…" : "No deliveries yet. They'll appear here as events fire."}
            </p>
          ) : (
            <ScrollArea className="max-h-80">
              <div className="flex flex-col gap-1">
                {deliveries.map((d, i) => {
                  const cfg = STATUS_CONFIG[d.status];
                  return (
                    <div key={d.id}>
                      {i > 0 && <Separator className="my-1" />}
                      <div className="flex items-start gap-3 py-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <code className="font-mono text-body-sm text-foreground">{d.event_type}</code>
                            <Badge variant="outline" className={`text-caption ${cfg.className}`}>
                              {cfg.label}
                            </Badge>
                            {d.last_status_code != null && (
                              <span className="text-caption text-muted-foreground">
                                HTTP {d.last_status_code}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-caption text-muted-foreground">
                            {formatDistanceToNow(new Date(d.created_at), { addSuffix: true })}
                            {d.attempts > 1 && <> · {d.attempts} attempts</>}
                            {d.tx_id && <> · tx {d.tx_id.slice(0, 10)}…</>}
                          </p>
                          {d.last_error && (
                            <p className="mt-1 truncate text-caption text-destructive" title={d.last_error}>
                              {d.last_error}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Dialog open={newSecret !== null} onOpenChange={(open) => !open && setNewSecret(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-success" /> New secret generated
            </DialogTitle>
            <DialogDescription>
              Copy this secret now — for security it won't be shown again. If you lose it, you can
              regenerate a new one, but your previous signatures will be invalidated.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 p-3">
            <Input
              readOnly
              value={newSecret ?? ""}
              className="font-mono text-body-sm"
              onFocus={(e) => e.target.select()}
            />
            <Button variant="outline" size="icon" onClick={copySecret} aria-label="Copy secret">
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setNewSecret(null)}>I've saved it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
