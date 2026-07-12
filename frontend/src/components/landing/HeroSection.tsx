import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useWalletStore, warmupWalletSdk } from "@/stores/wallet-store";
import { NETWORK_MODE } from "@/lib/stacks/config";
import InvoiceMock from "@/components/landing/InvoiceMock";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
  }),
};

export default function HeroSection() {
  const { isConnected, connect } = useWalletStore();
  const navigate = useNavigate();

  const handleGetStarted = () => {
    if (isConnected) {
      navigate("/dashboard");
    } else {
      connect();
    }
  };

  return (
    <section id="hero" className="relative pt-24 pb-16 sm:pt-32 sm:pb-20 lg:pt-40 lg:pb-32 bg-grid">
      <div className="container relative">
        <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-12 lg:gap-16 xl:gap-20 items-center">
          {/* Left — copy */}
          <motion.div
            className="text-center lg:text-left"
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.12 } } }}
          >
            <motion.h1
              variants={fadeUp}
              custom={0}
              className="text-display sm:text-display-lg lg:text-display-xl font-display tracking-tight text-balance"
            >
              Get paid in sBTC.{" "}
              <span className="text-primary whitespace-nowrap">Nothing weird.</span>
            </motion.h1>

            <motion.p
              variants={fadeUp}
              custom={1}
              className="mt-6 text-body-lg text-muted-foreground max-w-xl mx-auto lg:mx-0 text-balance"
            >
              A working payment link in 60 seconds. Invoices, subscriptions,
              one-time payments, paid directly to your wallet in sBTC or STX.
            </motion.p>

            <motion.div
              variants={fadeUp}
              custom={2}
              className="mt-8 flex flex-col items-stretch sm:flex-row sm:items-center sm:justify-center lg:justify-start gap-2.5 sm:gap-3 md:gap-4"
            >
              <Button
                size="lg"
                className="gap-2 text-base h-12 px-6 w-full sm:w-auto"
                onClick={handleGetStarted}
                onPointerEnter={warmupWalletSdk}
                onFocus={warmupWalletSdk}
              >
                {isConnected ? "Open dashboard" : "Get your link"}
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="lg" className="h-12 px-6 text-base w-full sm:w-auto" asChild>
                <a href="#how-it-works">How it works</a>
              </Button>
            </motion.div>

            <motion.p
              variants={fadeUp}
              custom={3}
              className="mt-6 text-caption text-muted-foreground"
            >
              {NETWORK_MODE === "mainnet"
                ? "Live on Stacks mainnet · Non-custodial"
                : "Live on Stacks testnet · Test funds only"}
            </motion.p>
          </motion.div>

          {/* Right — animated invoice mock */}
          <div className="w-full">
            <InvoiceMock />
          </div>
        </div>
      </div>
    </section>
  );
}
