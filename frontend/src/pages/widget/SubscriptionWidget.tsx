import { useState, useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Bitcoin, Repeat, Wallet, Loader2, Check, CreditCard } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatAmount, amountToUsd, tokenLabel, baseToHuman } from "@/lib/constants";
import { PageTransition } from "@/components/layout/PageTransition";
import { useWalletStore, useLivePrices } from "@/stores/wallet-store";
import { createSubscription, CONTRACT_ERRORS } from "@/lib/stacks/contract";
import { PAYMENT_CONTRACT, getExplorerTxUrl, type TokenType } from "@/lib/stacks/config";
import { PriceStatusBadge } from "@/components/pay/PriceStatusBadge";

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
  const rawToken = params.get("token") || 'sbtc';
  const tokenType: TokenType = (rawToken === 'stx' ? 'stx' : 'sbtc');

  const addr = merchantAddress || "";
  const parsedAmount = parseInt(amount);
  if (!parsedAmount || parsedAmount <= 0) {
    return (
      <div className="flex items-center justify-center min-h-[200px] text-destructive text-sm">
        Invalid or missing amount parameter.
      </div>
    );
  }
  const baseAmount = parsedAmount;
  const humanAmount = baseToHuman(baseAmount, tokenType);
  const intervalBlocks = INTERVAL_BLOCKS[interval.toLowerCase()] || parseInt(interval) || 4320;

  const { isConnected, address, sbtcBalance, stxBalance, balancesLoading, connect } = useWalletStore();
  const { btcPriceUsd, stxPriceUsd } = useLivePrices();
  const [subState, setSubState] = useState<"idle" | "confirming" | "subscribed" | "error">("idle");
  const [txId, setTxId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubscribe = useCallback(async () => {
    if (!addr || (subState !== "idle" && subState !== "error")) return;

    if (!isConnected || !address) {
      toast.info("Connect your wallet first");
      connect();
      return;
    }

    if (address === PAYMENT_CONTRACT.address) {
      toast.error("Fee-recipient wallet cannot subscribe");
      return;
    }

    if (address.toLowerCase() === addr.toLowerCase()) {
      toast.error("You cannot subscribe to yourself");
      return;
    }

    // NOTE: create-subscription does NOT transfer tokens — no balance check needed here.
    // Balance is checked before the first payment (handleFirstPayment).

    setSubState("confirming");
    setErrorMsg(null);

    try {
      toast.info("Please confirm the subscription in your wallet");
      const result = await createSubscription({
        merchantAddress: addr,
        name: plan,
        amount: BigInt(baseAmount),
        intervalBlocks,
        subscriberAddress: address,
        tokenType,
      });

      if (result.txId) {
        setTxId(result.txId);
        setSubState("subscribed");
        toast.success("Subscription created! You can now make your first payment.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Subscription failed";
      const errNum = msg.match(/u(\d{4})/)?.[1];
      const readable = errNum ? CONTRACT_ERRORS[Number(errNum)] : null;
      setErrorMsg(readable || msg);
      setSubState("error");
      toast.error(readable || msg);
    }
  }, [addr, plan, baseAmount, intervalBlocks, subState, isConnected, address, connect, tokenType]);

  if (subState === "subscribed" && txId) {
    // Subscription registered on-chain — direct user to Customer Portal for first payment
    const walletBalance = tokenType === 'stx' ? stxBalance : sbtcBalance;

    return (
      <PageTransition>
        <div className="min-h-svh flex items-center justify-center p-4 bg-background">
          <Card className="w-full max-w-xs border-border">
            <CardContent className="p-5 flex flex-col gap-space-md text-center">
              <Check className="h-12 w-12 text-success mx-auto" />
              <p className="text-heading-sm text-foreground">Subscribed!</p>
              <p className="text-body-sm text-muted-foreground">
                {humanAmount} {tokenLabel(tokenType)} (≈ ${amountToUsd(baseAmount, tokenType, btcPriceUsd, stxPriceUsd)} USD) / {interval}
              </p>
              <a href={getExplorerTxUrl(txId)} target="_blank" rel="noopener noreferrer"
                className="text-primary text-body-sm underline">
                View subscription TX →
              </a>
              <div className="border-t border-border pt-4 flex flex-col gap-2">
                <p className="text-body-sm text-muted-foreground">
                  Your first payment is due now. Once the subscription TX confirms on-chain, make your first payment from the <strong>Customer Portal</strong>.
                </p>
                <p className="text-caption text-muted-foreground">
                  Balance: {baseToHuman(Number(walletBalance), tokenType)} {tokenLabel(tokenType)}
                </p>
                <a href="/customer/subscriptions" className="inline-block">
                  <Button className="w-full h-11 gap-2 font-semibold" variant="default">
                    <CreditCard className="h-4 w-4" /> Go to Customer Portal
                  </Button>
                </a>
              </div>
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
          <CardContent className="p-5 flex flex-col gap-space-md">
            <div className="flex items-center justify-center gap-2">
              <Bitcoin className="h-4 w-4 text-primary" />
              <span className="text-body font-bold text-primary">sBTC Pay</span>
              <Badge variant="outline" className="text-micro border-stacks text-stacks">Subscribe</Badge>
            </div>

            <div className="text-center flex flex-col gap-1">
              <Repeat className="h-8 w-8 text-primary mx-auto" />
              <p className="text-heading-sm text-foreground">{plan}</p>
              <p className="text-heading sm:text-sats text-primary font-tabular">{humanAmount} {tokenLabel(tokenType)}</p>
              <p className="text-caption text-muted-foreground">≈ ${amountToUsd(baseAmount, tokenType, btcPriceUsd, stxPriceUsd)} USD per {interval}</p>
              <PriceStatusBadge />
            </div>

            {errorMsg && (
              <p className="text-body-sm text-destructive text-center">{errorMsg}</p>
            )}

            {!isConnected ? (
              <Button className="w-full h-11 gap-2 font-semibold" onClick={() => connect()}>
                <Wallet className="h-4 w-4" /> Connect Wallet
              </Button>
            ) : balancesLoading ? (
              <Button className="w-full h-11 gap-2 font-semibold" disabled>
                <Loader2 className="h-4 w-4 animate-spin" /> Loading balance…
              </Button>
            ) : (
              <>
                <p className="text-caption text-muted-foreground text-center">
                  Balance: {baseToHuman(Number(tokenType === 'stx' ? stxBalance : sbtcBalance), tokenType)} {tokenLabel(tokenType)}
                </p>
                <Button
                  className="w-full h-11 gap-2 font-semibold"
                  onClick={handleSubscribe}
                  disabled={subState === "confirming"}
                >
                  {subState === "confirming" ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Confirming...</>
                  ) : subState === "error" ? (
                    <><Wallet className="h-4 w-4" /> Try Again</>
                  ) : (
                    <><Wallet className="h-4 w-4" /> Subscribe Now</>
                  )}
                </Button>
              </>
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
