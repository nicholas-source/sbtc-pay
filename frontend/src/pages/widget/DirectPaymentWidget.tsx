import { useState, useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { AlertTriangle, Bitcoin, Wallet, Loader2, Check } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { PageTransition } from "@/components/layout/PageTransition";
import { formatAmount, amountToUsd, tokenLabel } from "@/lib/constants";
import { useWalletStore, useSatsToUsd, useLivePrices } from "@/stores/wallet-store";
import { payMerchantDirect, CONTRACT_ERRORS } from "@/lib/stacks/contract";
import { PAYMENT_CONTRACT, getExplorerTxUrl, type TokenType } from "@/lib/stacks/config";

export default function DirectPaymentWidget() {
  const { merchantAddress } = useParams();
  const [params] = useSearchParams();
  const amount = params.get("amount") || "";
  const memo = params.get("memo") || "";
  const theme = params.get("theme") || "dark";
  const color = params.get("color") || "orange";
  const tokenType = (params.get("token") as TokenType) || 'sbtc';

  const [payAmount, setPayAmount] = useState(amount);
  const [payMemo, setPayMemo] = useState(memo);
  const [payState, setPayState] = useState<"idle" | "confirming" | "confirmed" | "error">("idle");
  const [txId, setTxId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { isConnected, address, sbtcBalance, stxBalance, connect } = useWalletStore();
  const satsToUsd = useSatsToUsd();
  const { btcPriceUsd, stxPriceUsd } = useLivePrices();
  const addr = merchantAddress || "";

  const handlePay = useCallback(async () => {
    if (!addr || payState !== "idle") return;
    const sats = Number(payAmount);
    if (!sats || sats <= 0) { toast.error("Enter a valid amount"); return; }

    if (!isConnected || !address) {
      toast.info("Connect your wallet first");
      connect();
      return;
    }

    if (address === PAYMENT_CONTRACT.address) {
      toast.error("Fee-recipient wallet cannot make payments");
      return;
    }

    // Guard: check wallet balance before attempting payment
    const walletBalance = tokenType === 'stx' ? stxBalance : sbtcBalance;
    if (walletBalance < BigInt(sats)) {
      const label = tokenLabel(tokenType);
      toast.error(`Insufficient ${label} balance: need ${formatAmount(sats, tokenType)} but wallet has ${formatAmount(Number(walletBalance), tokenType)}`);
      return;
    }

    setPayState("confirming");
    setErrorMsg(null);

    try {
      toast.info("Please confirm the transaction in your wallet");
      const result = await payMerchantDirect({
        merchantAddress: addr,
        amount: BigInt(sats),
        memo: payMemo || "",
        payerAddress: address,
        tokenType,
      });

      if (result.txId) {
        setTxId(result.txId);
        setPayState("confirmed");
        toast.success("Payment submitted!");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Payment failed";
      // Check for known contract errors
      const errNum = msg.match(/u(\d{4})/)?.[1];
      const readable = errNum ? CONTRACT_ERRORS[Number(errNum)] : null;
      setErrorMsg(readable || msg);
      setPayState("error");
      toast.error(readable || msg);
    }
  }, [addr, payAmount, payMemo, payState, isConnected, address, connect]);

  if (!addr) {
    return (
      <PageTransition>
        <div className="min-h-svh flex items-center justify-center p-4 bg-background">
          <Card className="w-full max-w-sm border-border">
            <CardContent className="p-6 flex flex-col items-center gap-4 text-center">
              <AlertTriangle className="h-10 w-10 text-destructive" />
              <p className="text-heading-sm text-foreground">Invalid Widget</p>
              <p className="text-body-sm text-muted-foreground">
                No merchant address provided. The widget URL must include a valid merchant address.
              </p>
            </CardContent>
          </Card>
        </div>
      </PageTransition>
    );
  }

  if (payState === "confirmed" && txId) {
    return (
      <PageTransition>
        <div className={`min-h-svh flex items-center justify-center p-4 ${theme === "dark" ? "bg-background" : "bg-white"}`}>
          <Card className="w-full max-w-sm border-border">
            <CardContent className="p-6 space-y-4 text-center">
              <Check className="h-12 w-12 text-success mx-auto" />
              <p className="text-heading-sm text-foreground">Payment Submitted</p>
              <p className="text-body-sm text-muted-foreground">
                {formatAmount(Number(payAmount), tokenType)} {tokenLabel(tokenType)} <span className="text-muted-foreground/70">(≈ ${amountToUsd(Number(payAmount), tokenType, btcPriceUsd, stxPriceUsd)} USD)</span> sent to merchant
              </p>
              <a
                href={getExplorerTxUrl(txId)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary text-body-sm underline"
              >
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
      <div className={`min-h-svh flex items-center justify-center p-4 ${theme === "dark" ? "bg-background" : "bg-white"}`}>
        <Card className="w-full max-w-sm border-border">
          <CardContent className="p-6 space-y-5">
            <div className="flex items-center justify-center gap-2">
              <Bitcoin className="h-5 w-5 text-primary" />
              <span className="text-heading-sm text-primary">sBTC Pay</span>
              <Badge variant="outline" className="text-micro border-stacks text-stacks">Widget</Badge>
            </div>

            <div className="flex justify-center">
              <div className="rounded-lg bg-white p-2.5 sm:p-3">
                <QRCodeSVG value={addr} size={140} level="M" className="h-[100px] w-[100px] sm:h-[120px] sm:w-[120px] md:h-[140px] md:w-[140px]" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-caption text-muted-foreground">Amount ({tokenLabel(tokenType)})</label>
              <Input
                type="number"
                min={1}
                placeholder="Enter amount in sats"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="font-tabular"
                disabled={payState === "confirming"}
              />
              {payAmount && Number(payAmount) > 0 && (
                <p className="text-caption text-muted-foreground">{formatAmount(Number(payAmount), tokenType)} {tokenLabel(tokenType)} <span className="text-muted-foreground/70">≈ ${amountToUsd(Number(payAmount), tokenType, btcPriceUsd, stxPriceUsd)} USD</span></p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-caption text-muted-foreground">Memo</label>
              <Input
                placeholder="What's this for?"
                value={payMemo}
                onChange={(e) => setPayMemo(e.target.value)}
                disabled={payState === "confirming"}
              />
            </div>

            {errorMsg && (
              <p className="text-body-sm text-destructive text-center">{errorMsg}</p>
            )}

            {!isConnected ? (
              <Button className="w-full h-11 gap-2 font-semibold" onClick={() => connect()}>
                <Wallet className="h-4 w-4" /> Connect Wallet
              </Button>
            ) : (
              <Button
                className="w-full h-11 gap-2 font-semibold"
                onClick={handlePay}
                disabled={payState === "confirming" || !payAmount || Number(payAmount) <= 0}
              >
                {payState === "confirming" ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Confirming...</>
                ) : (
                  <><Wallet className="h-4 w-4" /> Pay {payAmount ? `${formatAmount(Number(payAmount), tokenType)} ${tokenLabel(tokenType)}` : ""}</>
                )}
              </Button>
            )}

            <p className="text-micro text-muted-foreground text-center">
              {isConnected && address ? (
                <>Connected: <code className="font-mono">{address.slice(0, 6)}…{address.slice(-4)}</code> · </>
              ) : null}
              Paying to <code className="font-mono">{addr.slice(0, 8)}…{addr.slice(-4)}</code>
            </p>
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}
