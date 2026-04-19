import { useMemo, useState } from "react";
import { PageTransition } from "@/components/layout/PageTransition";
import { format } from "date-fns";
import { Pause, Play, XCircle, Inbox, CreditCard, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useSubscriptionStore, type SubscriberStatus } from "@/stores/subscription-store";
import { useWalletStore, useLivePrices } from "@/stores/wallet-store";
import ReminderBanner from "@/components/subscription/ReminderBanner";

import { formatAmount, amountToUsd, tokenLabel, baseToHuman } from "@/lib/constants";

const statusStyles: Record<SubscriberStatus, string> = {
  active: "bg-success/15 text-success border-success/30",
  paused: "bg-warning/15 text-warning border-warning/30",
  cancelled: "bg-destructive/15 text-destructive border-destructive/30",
};

function CustomerSubscriptions() {
  const { address, isConnected, sbtcBalance, stxBalance } = useWalletStore();
  const { btcPriceUsd, stxPriceUsd } = useLivePrices();
  const plans = useSubscriptionStore((s) => s.plans);
  const subscribers = useSubscriptionStore((s) => s.subscribers);
  const pauseSub = useSubscriptionStore((s) => s.pauseSubscription);
  const resumeSub = useSubscriptionStore((s) => s.resumeSubscription);
  const cancelSub = useSubscriptionStore((s) => s.cancelSubscription);
  const processRenewal = useSubscriptionStore((s) => s.processRenewal);
  const [payingId, setPayingId] = useState<string | null>(null);

  // Filter to subscriptions belonging to the connected wallet
  const mySubs = useMemo(
    () => (address ? subscribers.filter((s) => s.payerAddress?.toLowerCase() === address.toLowerCase()) : []),
    [subscribers, address],
  );

  const activeSubs = useMemo(() => mySubs.filter((s) => s.status !== "cancelled"), [mySubs]);
  const pastSubs = useMemo(() => mySubs.filter((s) => s.status === "cancelled"), [mySubs]);

  function getPlan(planId: string) {
    return plans.find((p) => p.id === planId);
  }

  function isPaymentDue(sub: { nextPaymentAt: Date; status: string }) {
    return sub.status === "active" && new Date(sub.nextPaymentAt) <= new Date();
  }

  async function handlePayNow(subId: string) {
    setPayingId(subId);
    try {
      await processRenewal(subId);
      toast.success("Payment processed!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Payment failed";
      toast.error(msg);
    } finally {
      setPayingId(null);
    }
  }

  async function handlePause(id: string) {
    try {
      await pauseSub(id);
      toast.success("Subscription paused");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to pause");
    }
  }

  async function handleResume(id: string) {
    try {
      await resumeSub(id);
      toast.success("Subscription resumed");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to resume");
    }
  }

  async function handleCancel(id: string) {
    try {
      await cancelSub(id);
      toast.success("Subscription cancelled");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel");
    }
  }

  return (
    <PageTransition className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-heading-lg text-foreground">My Subscriptions</h1>
        <p className="text-body-sm text-muted-foreground mt-1">
          {isConnected && address
            ? `Wallet: ${address.slice(0, 8)}…${address.slice(-6)}`
            : "Connect your wallet to see your subscriptions."}
        </p>
      </div>

      {/* Reminder Banner */}
      <ReminderBanner />

      {/* Active / Paused */}
      {activeSubs.length === 0 && pastSubs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Inbox className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <p className="text-body text-muted-foreground">No subscriptions found.</p>
          <p className="text-body-sm text-muted-foreground mt-1">
            When you subscribe to a plan, it will appear here.
          </p>
        </div>
      ) : (
        <>
          {activeSubs.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-heading-sm text-foreground">Active</h2>
              {activeSubs.map((sub) => {
                const plan = getPlan(sub.planId);
                if (!plan) return null;
                const usd = amountToUsd(plan.amount, plan.tokenType, btcPriceUsd, stxPriceUsd);

                return (
                  <Card key={sub.id}>
                    <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pb-2">
                      <CardTitle className="text-heading-sm">{plan.name}</CardTitle>
                      <Badge variant="outline" className={statusStyles[sub.status]}>
                        {sub.status}
                      </Badge>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono-nums text-sats text-foreground">
                          {formatAmount(plan.amount, plan.tokenType)}
                        </span>
                        <span className="text-caption text-muted-foreground">
                          {tokenLabel(plan.tokenType)} / {plan.interval}
                        </span>
                        <span className="text-caption text-muted-foreground">≈ ${usd}</span>
                      </div>

                      <p className="text-body-sm text-muted-foreground">
                        Next payment: {format(sub.nextPaymentAt, "MMM d, yyyy")}
                      </p>

                      <div className="flex flex-wrap gap-2 pt-1">
                        {sub.status === "active" && isPaymentDue(sub) && (
                          <Button
                            size="sm"
                            onClick={() => handlePayNow(sub.id)}
                            disabled={payingId === sub.id}
                            className="gap-1"
                          >
                            {payingId === sub.id ? (
                              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                            ) : (
                              <CreditCard className="mr-1 h-4 w-4" />
                            )}
                            {payingId === sub.id ? "Processing…" : "Pay Now"}
                          </Button>
                        )}
                        {sub.status === "active" ? (
                          <Button variant="outline" size="sm" onClick={() => handlePause(sub.id)}>
                            <Pause className="mr-1 h-4 w-4" /> Pause
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" onClick={() => handleResume(sub.id)}>
                            <Play className="mr-1 h-4 w-4" /> Resume
                          </Button>
                        )}

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10 transition-colors">
                              <XCircle className="mr-1 h-4 w-4" /> Cancel
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Cancel subscription?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will cancel your "{plan.name}" subscription. You won't be charged again.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Keep Subscription</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => handleCancel(sub.id)}
                              >
                                Cancel Subscription
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Past / Cancelled */}
          {pastSubs.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-heading-sm text-muted-foreground">Past</h2>
              {pastSubs.map((sub) => {
                const plan = getPlan(sub.planId);
                if (!plan) return null;

                return (
                  <Card key={sub.id} className="opacity-60">
                    <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pb-2">
                      <CardTitle className="text-heading-sm">{plan.name}</CardTitle>
                      <Badge variant="outline" className={statusStyles[sub.status]}>
                        {sub.status}
                      </Badge>
                    </CardHeader>
                    <CardContent>
                      <p className="text-body-sm text-muted-foreground">
                        {formatAmount(plan.amount, plan.tokenType)} {tokenLabel(plan.tokenType)} / {plan.interval} — started{" "}
                        {format(sub.startedAt, "MMM d, yyyy")}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </PageTransition>
  );
}
export default CustomerSubscriptions;
