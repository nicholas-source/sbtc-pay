import { useParams, useSearchParams } from "react-router-dom";
import { Bitcoin, Repeat, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { PageTransition } from "@/components/layout/PageTransition";

export default function SubscriptionWidget() {
  const { merchantAddress } = useParams();
  const [params] = useSearchParams();
  const plan = params.get("plan") || "Standard Plan";
  const amount = params.get("amount") || "100000";
  const interval = params.get("interval") || "monthly";

  const addr = merchantAddress || "";
  const satsAmount = parseInt(amount) || 100000;

  return (
    <PageTransition>
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <Card className="w-full max-w-xs card-glow border-border">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-center gap-2">
              <Bitcoin className="h-4 w-4 text-primary" />
              <span className="text-body font-bold text-gradient-orange">sBTC Pay</span>
              <Badge variant="outline" className="text-[10px] border-stacks text-stacks">Subscribe</Badge>
            </div>

            <div className="text-center space-y-1">
              <Repeat className="h-8 w-8 text-primary mx-auto" />
              <p className="text-heading-sm text-foreground">{plan}</p>
              <p className="text-sats text-gradient-orange font-tabular">{satsAmount.toLocaleString()} sats</p>
              <p className="text-caption text-muted-foreground">per {interval}</p>
            </div>

            <Button className="w-full h-10 gap-2 font-semibold" onClick={() => toast.info("Connect wallet to subscribe")}>
              <Wallet className="h-4 w-4" /> Subscribe Now
            </Button>

            <p className="text-[10px] text-muted-foreground text-center">
              Merchant: <code className="font-mono">{addr.slice(0, 8)}…{addr.slice(-4)}</code>
            </p>
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}
