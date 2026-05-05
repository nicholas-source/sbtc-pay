import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Bitcoin, ArrowRight } from "lucide-react";
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
        <motion.div
          className="mx-auto max-w-2xl text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-heading-lg sm:text-display lg:text-display-lg font-display text-foreground mb-4">
            Ready to accept{" "}
            <span className="text-primary">Bitcoin payments?</span>
          </h2>
          <p className="text-body-lg text-muted-foreground mb-8 max-w-xl mx-auto">
            Join merchants already using sBTC Pay. Connect your wallet and create your first invoice
            in under a minute.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button size="lg" className="gap-2 h-12 px-8 text-base w-full sm:w-auto" onClick={handleStart}>
              <Bitcoin className="h-4 w-4" />
              {isConnected ? "Open Dashboard" : "Connect Wallet to Start"}
            </Button>
            <Button variant="outline" size="lg" className="h-12 px-6 text-base w-full sm:w-auto" asChild>
              <Link to="/docs">
                Read the Docs <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
