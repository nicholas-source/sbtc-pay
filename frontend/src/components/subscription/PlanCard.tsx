import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useSubscriptionStore, type SubscriptionPlan } from "@/stores/subscription-store";
import SubscriberTable from "./SubscriberTable";

import { formatAmount, amountToUsd, tokenLabel } from "@/lib/constants";
import { useLivePrices } from "@/stores/wallet-store";

interface PlanCardProps {
  plan: SubscriptionPlan;
}

export default function PlanCard({ plan }: PlanCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { btcPriceUsd, stxPriceUsd } = useLivePrices();
  const togglePlan = useSubscriptionStore((s) => s.togglePlan);
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

  return (
    <Card className="card-accent-secondary">
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
        <div className="space-y-1">
          <CardTitle className="text-heading-sm">{plan.name}</CardTitle>
          <p className="text-body-sm text-muted-foreground line-clamp-2">{plan.description}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant={plan.isActive ? "default" : "secondary"}>
            {plan.isActive ? "Active" : "Inactive"}
          </Badge>
          <Switch
            checked={plan.isActive}
            onCheckedChange={() => togglePlan(plan.id)}
            aria-label="Toggle plan"
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Hide" : "Subscribers"}
            {expanded ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />}
          </Button>
        </div>

        {expanded && (
          <div className="pt-2">
            <SubscriberTable planId={plan.id} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
