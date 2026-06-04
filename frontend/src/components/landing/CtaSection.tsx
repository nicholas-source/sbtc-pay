import { Reveal } from "./Reveal";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useWalletStore } from "@/stores/wallet-store";

export default function CtaSection() {
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
    <section className="py-16 sm:py-20 md:py-28 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-secondary/5 pointer-events-none" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-secondary/30 to-transparent" />

      <div className="container relative">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-heading-lg sm:text-display lg:text-display-lg font-display text-foreground mb-4">
            Ready when{" "}
            <span className="text-primary">you are.</span>
          </h2>
          <p className="text-body-lg text-muted-foreground mb-8 max-w-xl mx-auto">
            Connect a wallet and you'll have a live payment link in under a minute.
            No accounts. No waitlists. No KYC.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button size="lg" className="gap-2 h-12 px-8 text-base w-full sm:w-auto" onClick={handleStart}>
              {isConnected ? "Open dashboard" : "Get your link"}
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="lg" className="h-12 px-6 text-base w-full sm:w-auto gap-2" asChild>
              <Link to="/docs">
                Read the docs <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
