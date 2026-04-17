import { useState, useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Bitcoin, Repeat, Wallet, Loader2, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatAmount, amountToUsd, tokenLabel } from "@/lib/constants";
import { PageTransition } from "@/components/layout/PageTransition";
import { useWalletStore, useSatsToUsd, useLivePrices } from "@/stores/wallet-store";
import { createSubscription, CONTRACT_ERRORS } from "@/lib/stacks/contract";
import { PAYMENT_CONTRACT, getExplorerTxUrl, type TokenType } from "@/lib/stacks/config";

// Map interval label → approximate block count (~10 min/block)
const INTERVAL_BLOCKS: Record<string, number> = {
  daily: 144,
  weekly: 1008,
  biweekly: 2016,
  monthly: 4320,
  quarterly: 12960,
  yearly: 52560,
};

export default function SubscriptionWidget() {
  const { merchantAddress } = useParams();
  const [params] = useSearchParams();
  const plan = params.get("plan") || "Standard Plan";
  const amount = params.get("amount") || "100000";
  const interval = params.get("interval") || "monthly";
  const tokenType = (params.get("token") as TokenType) || 'sbtc';

  const addr = merchantAddress || "";
  const satsAmount = parseInt(amount) || 100000;
  const intervalBlocks = INTERVAL_BLOCKS[interval.toLowerCase()] || parseInt(interval) || 4320;

  const { isConnected, address, sbtcBalance, stxBalance, connect } = useWalletStore();
  const satsToUsd = useSatsToUsd();
  const { btcPriceUsd, stxPriceUsd } = useLivePrices();
  const [subState, setSubState] = useState<"idle" | "confirming" | "confirmed" | "error">("idle");
  const [txId, setTxId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubscribe = useCallback(async () => {
    if (!addr || subState !== "idle") return;

    if (!isConnected || !address) {
      toast.info("Connect your wallet first");
      connect();
      return;
    }

    if (address === PAYMENT_CONTRACT.address) {
      toast.error("Fee-recipient wallet cannot subscribe");
      return;
    }

    // Guard: check wallet balance before attempting subscription
    const walletBalance = tokenType === 'stx' ? stxBalance : sbtcBalance;
    if (walletBalance < BigInt(satsAmount)) {
      const label = tokenLabel(tokenType);
      toast.error(`Insufficient ${label} balance: need ${formatAmount(satsAmount, tokenType)} but wallet has ${formatAmount(Number(walletBalance), tokenType)}`);
      return;
    }

    setSubState("confirming");
    setErrorMsg(null);

    try {
      toast.info("Please confirm the transaction in your wallet");
      const result = await createSubscription({
        merchantAddress: addr,
        name: plan,
        amount: BigInt(satsAmount),
        intervalBlocks,
        subscriberAddress: address,
        tokenType,
      });

      if (result.txId) {
        setTxId(result.txId);
        setSubState("confirmed");
        toast.success("Subscription created!");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Subscription failed";
      const errNum = msg.match(/u(\d{4})/)?.[1];
      const readable = errNum ? CONTRACT_ERRORS[Number(errNum)] : null;
      setErrorMsg(readable || msg);
      setSubState("error");
      toast.error(readable || msg);
    }
  }, [addr, plan, satsAmount, intervalBlocks, subState, isConnected, address, connect]);

  if (subState === "confirmed" && txId) {
    return (
      <PageTransition>
        <div className="min-h-svh flex items-center justify-center p-4 bg-background">
          <Card className="w-full max-w-xs border-border">
            <CardContent className="p-5 space-y-4 text-center">
              <Check className="h-12 w-12 text-success mx-auto" />
              <p className="text-heading-sm text-foreground">Subscribed!</p>
              <p className="text-body-sm text-muted-foreground">
                {formatAmount(satsAmount, tokenType)} {tokenLabel(tokenType)} (≈ ${amountToUsd(satsAmount, tokenType, btcPriceUsd, stxPriceUsd)} USD) / {interval}
              </p>
              <a href={getExplorerTxUrl(txId)} target="_blank" rel="noopener noreferrer"
                className="text-primary text-body-sm underline">
                View transaction →
              </a>
            </CardContent>
          </Card>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="min-h-svh flex items-center justify-center p-4 bg-background">
        <Card className="w-full max-w-xs border-border">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-center gap-2">
              <Bitcoin className="h-4 w-4 text-primary" />
              <span className="text-body font-bold text-primary">sBTC Pay</span>
              <Badge variant="outline" className="text-micro border-stacks text-stacks">Subscribe</Badge>
            </div>

            <div className="text-center space-y-1">
              <Repeat className="h-8 w-8 text-primary mx-auto" />
              <p className="text-heading-sm text-foreground">{plan}</p>
              <p className="text-2xl sm:text-sats text-primary font-tabular">{formatAmount(satsAmount, tokenType)} {tokenLabel(tokenType)}</p>
              <p className="text-caption text-muted-foreground">≈ ${amountToUsd(satsAmount, tokenType, btcPriceUsd, stxPriceUsd)} USD per {interval}</p>
            </div>

            {errorMsg && (
              <p className="text-body-sm text-destructive text-center">{errorMsg}</p>
            )}

            {!isConnected ? (
              <Button className="w-full h-10 gap-2 font-semibold" onClick={() => connect()}>
                <Wallet className="h-4 w-4" /> Connect Wallet
              </Button>
            ) : (
              <Button
                className="w-full h-10 gap-2 font-semibold"
                onClick={handleSubscribe}
                disabled={subState === "confirming"}
              >
                {subState === "confirming" ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Confirming...</>
                ) : (
                  <><Wallet className="h-4 w-4" /> Subscribe Now</>
                )}
              </Button>
            )}

            <p className="text-micro text-muted-foreground text-center">
              {isConnected && address ? (
                <>Connected: <code className="font-mono">{address.slice(0, 6)}…{address.slice(-4)}</code> · </>
              ) : null}
              Merchant: <code className="font-mono">{addr.slice(0, 8)}…{addr.slice(-4)}</code>
            </p>
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}
