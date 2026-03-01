import { useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Bitcoin, Wallet } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { PageTransition } from "@/components/layout/PageTransition";

export default function DirectPaymentWidget() {
  const { merchantAddress } = useParams();
  const [params] = useSearchParams();
  const amount = params.get("amount") || "";
  const memo = params.get("memo") || "";
  const theme = params.get("theme") || "dark";
  const color = params.get("color") || "orange";

  const [payAmount, setPayAmount] = useState(amount);
  const [payMemo, setPayMemo] = useState(memo);

  const addr = merchantAddress || "";

  return (
    <PageTransition>
      <div className={`min-h-screen flex items-center justify-center p-4 ${theme === "dark" ? "bg-background" : "bg-white"}`}>
        <Card className="w-full max-w-sm card-glow border-border">
          <CardContent className="p-6 space-y-5">
            <div className="flex items-center justify-center gap-2">
              <Bitcoin className="h-5 w-5 text-primary" />
              <span className="text-heading-sm text-gradient-orange">sBTC Pay</span>
              <Badge variant="outline" className="text-[10px] border-stacks text-stacks">Widget</Badge>
            </div>

            <div className="flex justify-center">
              <div className="rounded-lg bg-white p-3">
                <QRCodeSVG value={addr} size={140} level="M" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-caption text-muted-foreground">Amount (sats)</label>
              <Input
                type="number"
                min={1}
                placeholder="Enter amount"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="font-tabular"
              />
            </div>

            <div className="space-y-2">
              <label className="text-caption text-muted-foreground">Memo</label>
              <Input
                placeholder="What's this for?"
                value={payMemo}
                onChange={(e) => setPayMemo(e.target.value)}
              />
            </div>

            <Button className="w-full h-11 gap-2 font-semibold" onClick={() => toast.info("Connect wallet to pay (blockchain integration pending)")}>
              <Wallet className="h-4 w-4" /> Pay {payAmount ? `${parseInt(payAmount).toLocaleString()} sats` : ""}
            </Button>

            <p className="text-[10px] text-muted-foreground text-center">
              Paying to <code className="font-mono">{addr.slice(0, 8)}…{addr.slice(-4)}</code>
            </p>
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}
