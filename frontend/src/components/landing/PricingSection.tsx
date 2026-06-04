import { Reveal } from "./Reveal";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { useWalletStore } from "@/stores/wallet-store";

const checkpoints = [
  "0.5% platform fee, deducted on-chain at payment time",
  "No monthly fees, no hidden costs",
  "Settles directly to your wallet — no intermediary holds funds",
  "Real-time webhook notifications",
  "Script tag, iframe, or programmatic SDK — your choice",
];

export default function PricingSection() {
  const { isConnected, connect } = useWalletStore();
  const navigate = useNavigate();

  const handleStart = () => {
    if (isConnected) {
      navigate("/dashboard");
    } else {
      connect();
    }
  };

  return (
    <section id="pricing" className="py-12 sm:py-16 md:py-24 relative">
      <div className="absolute inset-0 bg-surface-1/50" />
      <div className="container relative">
        <Reveal className="mx-auto max-w-lg text-center">
          <h2 className="text-heading-lg sm:text-display font-display text-foreground">
            Simple, transparent{" "}
            <span className="text-primary">pricing</span>
          </h2>
          <p className="mt-4 text-body-lg text-muted-foreground">
            No subscriptions. No hidden fees. Just 0.5% per transaction.
          </p>
        </Reveal>

        <Reveal
          className="mt-12 mx-auto max-w-sm sm:max-w-md px-2 sm:px-0"
          transition={{ delay: 0.15 }}
        >
          <Card className="border-primary/30 relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent" />
            <CardContent className="p-4 sm:p-6 md:p-8">
              <div className="text-center">
                <Reveal
                  className="text-display sm:text-display-lg md:text-display-xl text-primary font-black"
                  from={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                >
                  0.5%
                </Reveal>
                <p className="mt-2 text-body text-muted-foreground">per transaction</p>
              </div>

              <div className="mt-8 flex flex-col gap-space-sm">
                {checkpoints.map((c) => (
                  <div key={c} className="flex items-start gap-3 text-body-sm text-foreground">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-success mt-0.5" />
                    <span>{c}</span>
                  </div>
                ))}
              </div>

              <Button size="lg" className="w-full mt-8 h-12 gap-2 text-base" onClick={handleStart}>
                {isConnected ? "Open dashboard" : "Get your link"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        </Reveal>
      </div>
    </section>
  );
}
