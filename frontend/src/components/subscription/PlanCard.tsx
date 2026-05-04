import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, Users, Trash2, Calendar, Link2, Check } from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSubscriptionStore, type SubscriptionPlan } from "@/stores/subscription-store";
import SubscriberTable from "./SubscriberTable";

import { formatAmount, amountToUsd, tokenLabel } from "@/lib/constants";
import { useLivePrices } from "@/stores/wallet-store";
import { toast } from "sonner";

interface PlanCardProps {
  plan: SubscriptionPlan;
}

export default function PlanCard({ plan }: PlanCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const { btcPriceUsd, stxPriceUsd } = useLivePrices();
  const togglePlan = useSubscriptionStore((s) => s.togglePlan);
  const deletePlan = useSubscriptionStore((s) => s.deletePlan);
  const allSubscribers = useSubscriptionStore((s) => s.subscribers);
  const subscribers = useMemo(
    () => allSubscribers.filter((sub) => sub.planId === plan.id),
    [allSubscribers, plan.id]
  );
  const activeCount = useMemo(
    () => subscribers.filter((s) => s.status === "active").length,
    [subscribers]
  );
  const usd = amountToUsd(plan.amount, plan.tokenType, btcPriceUsd, stxPriceUsd);
  const canDelete = subscribers.length === 0;
  const hasActiveSubs = activeCount > 0;
  const safeCreatedAt = plan.createdAt instanceof Date && !isNaN(plan.createdAt.getTime())
    ? plan.createdAt
    : typeof plan.createdAt === 'string' ? new Date(plan.createdAt) : null;

  const subscribeUrl = useMemo(() => {
    const base = window.location.origin;
    const params = new URLSearchParams();
    params.set("plan", plan.name);
    params.set("amount", String(plan.amount));
    params.set("interval", plan.interval);
    if (plan.tokenType !== "sbtc") params.set("token", plan.tokenType);
    return `${base}/widget/subscribe/${plan.merchantAddress}?${params.toString()}`;
  }, [plan]);

  const copySubscribeLink = async () => {
    try {
      await navigator.clipboard.writeText(subscribeUrl);
      setLinkCopied(true);
      toast.success("Subscribe link copied");
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  };

  return (
    <Card className="card-accent-secondary">
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <CardTitle className="text-heading-sm">{plan.name}</CardTitle>
            <Badge variant="outline" className={plan.tokenType === 'stx' ? 'border-stacks text-stacks' : 'border-primary text-primary'}>
              {tokenLabel(plan.tokenType)}
            </Badge>
          </div>
          {plan.description && (
            <p className="text-body-sm text-muted-foreground line-clamp-2">{plan.description}</p>
          )}
          {safeCreatedAt && !isNaN(safeCreatedAt.getTime()) && (
            <p className="text-micro text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Created {format(safeCreatedAt, "MMM d, yyyy")}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant={plan.isActive ? "default" : "secondary"}>
            {plan.isActive ? "Active" : "Inactive"}
          </Badge>
          <Switch
            checked={plan.isActive}
            onCheckedChange={() => {
              if (plan.isActive && hasActiveSubs) {
                setDeactivateOpen(true);
              } else {
                togglePlan(plan.id);
              }
            }}
            aria-label="Toggle plan"
          />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-space-md">
        <div className="flex items-baseline gap-2">
          <span className="font-mono-nums text-sats text-foreground">
            {formatAmount(plan.amount, plan.tokenType)}
          </span>
          <span className="text-caption text-muted-foreground">{tokenLabel(plan.tokenType)} / {plan.interval}</span>
        </div>
        <p className="text-caption text-muted-foreground">≈ ${usd} USD</p>

        <div className="flex items-center justify-between border-t border-border pt-3">
          <div className="flex items-center gap-2 text-body-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            <span>{activeCount} active</span>
            <span className="text-muted-foreground/50">/ {subscribers.length} total</span>
          </div>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" onClick={copySubscribeLink} disabled={!plan.merchantAddress}>
                  {linkCopied ? <Check className="h-4 w-4 text-success" /> : <Link2 className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copy subscribe link</TooltipContent>
            </Tooltip>
            {canDelete && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete "{plan.name}"?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently remove this subscription plan. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => {
                        deletePlan(plan.id);
                        toast.success(`Plan "${plan.name}" deleted`);
                      }}
                    >
                      Delete Plan
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "Hide" : "Subscribers"}
              {expanded ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />}
            </Button>
          </div>
        </div>

        {expanded && (
          <div className="pt-2">
            <SubscriberTable planId={plan.id} />
          </div>
        )}
      </CardContent>

      <AlertDialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate "{plan.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This plan has {activeCount} active subscriber{activeCount > 1 ? 's' : ''}. Deactivating will prevent new sign-ups but won’t cancel existing subscriptions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Active</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => togglePlan(plan.id)}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
