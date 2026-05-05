import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Bitcoin, ArrowRight } from "lucide-react";
import { useWalletStore } from "@/stores/wallet-store";
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
    <section id="main-content" className="relative pt-24 pb-16 sm:pt-32 sm:pb-20 lg:pt-44 lg:pb-32 bg-grid">
      <div className="container relative">
        <motion.div
          className="mx-auto max-w-4xl text-center"
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.12 } } }}
        >
          <motion.div variants={fadeUp} custom={0}>
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 sm:px-4 py-1.5 text-caption font-semibold text-primary">
              <Bitcoin className="h-3.5 w-3.5" />
              Powered by Stacks & sBTC
            </span>
          </motion.div>

          <motion.h1
            variants={fadeUp}
            custom={1}
            className="mt-6 text-display sm:text-display-lg lg:text-display-xl tracking-tight"
          >
            Accept Bitcoin payments.{" "}
            <span className="text-primary">Built on Stacks.</span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            custom={2}
            className="mt-6 text-body-lg text-muted-foreground max-w-xl mx-auto"
          >
            Enterprise-grade invoicing with partial payments, refunds, recurring
            subscriptions, and embeddable widgets — settled directly to your wallet on Bitcoin.
          </motion.p>

          <motion.div variants={fadeUp} custom={3} className="mt-8 flex flex-col items-stretch sm:flex-row sm:items-center sm:justify-center gap-2.5 sm:gap-3 md:gap-4">
            <Button size="lg" className="gap-2 text-base h-12 px-6 w-full sm:w-auto" onClick={handleGetStarted}>
              {isConnected ? "Open Dashboard" : "Get Started"}
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="lg" className="h-12 px-6 text-base w-full sm:w-auto" asChild>
              <a href="#how-it-works">How it works</a>
            </Button>
          </motion.div>

          {/* Animated invoice mock — visible on all screen sizes */}
          <div className="mt-10 sm:mt-12 md:mt-14">
            <InvoiceMock />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
