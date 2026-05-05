import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Bitcoin, ArrowRight, Clock } from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
  }),
};

export default function HeroSection() {
  return (
    <section id="main-content" className="relative pt-24 pb-16 sm:pt-32 sm:pb-20 lg:pt-44 lg:pb-32 bg-grid">
      <div className="container relative">
        <motion.div
          className="mx-auto max-w-3xl text-center"
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
            Enterprise-grade invoicing with partial payments, refunds, recurring subscriptions,
            and embeddable widgets — all trustlessly on the blockchain.
          </motion.p>

          <motion.div variants={fadeUp} custom={3} className="mt-8 flex flex-col items-stretch sm:flex-row sm:items-center sm:justify-center gap-2.5 sm:gap-3 md:gap-4">
            <Button size="lg" className="gap-2 text-base h-12 px-6 w-full sm:w-auto" asChild>
              <Link to="/dashboard">
                Get Started
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" className="h-12 px-6 text-base w-full sm:w-auto" asChild>
              <a href="#features">Learn More</a>
            </Button>
          </motion.div>

          {/* Hero visual — invoice payment widget mock */}
          <motion.div variants={fadeUp} custom={4} className="mt-14 hidden md:block">
            <div className="rounded-2xl border border-border overflow-hidden shadow-2xl">
              {/* Browser chrome */}
              <div className="flex items-center gap-4 px-4 py-3 border-b border-border bg-card">
                <div className="flex items-center gap-1.5 shrink-0">
                  <div className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
                  <div className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
                  <div className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
                </div>
                <div className="flex-1 flex items-center justify-center">
                  <div className="flex items-center gap-1.5 rounded-md bg-background border border-border/60 px-3 py-1 max-w-[280px] w-full">
                    <div className="h-2.5 w-2.5 rounded-full bg-success/70 shrink-0" />
                    <span className="text-micro text-muted-foreground font-mono truncate">sbtcpay.com/pay/inv-28f4a3</span>
                  </div>
                </div>
                <div className="w-[52px] shrink-0" aria-hidden="true" />
              </div>

              {/* Page */}
              <div className="bg-background py-10 px-4 flex items-center justify-center">
                <div className="w-full max-w-[340px] rounded-xl border border-border bg-card p-5 shadow-sm select-none" aria-hidden="true">
                  {/* Invoice header */}
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2.5">
                      <div className="h-9 w-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                        <Bitcoin className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-body-sm font-semibold text-foreground leading-tight">Coffee Shop BTC</p>
                        <p className="text-micro text-muted-foreground font-mono">INV-2025-0042</p>
                      </div>
                    </div>
                    <span className="text-micro font-semibold px-2 py-0.5 rounded-full bg-warning/10 text-warning border border-warning/25">
                      Partial
                    </span>
                  </div>

                  {/* Amount */}
                  <div className="mb-5">
                    <p className="text-micro text-muted-foreground mb-0.5">Amount Due</p>
                    <p className="font-mono text-2xl font-bold text-foreground leading-none">
                      0.005{" "}
                      <span className="text-base font-normal text-muted-foreground">sBTC</span>
                    </p>
                    <p className="text-caption text-muted-foreground mt-0.5">≈ $320.00 USD</p>
                  </div>

                  {/* Progress */}
                  <div className="mb-4">
                    <div className="flex justify-between text-micro text-muted-foreground mb-1.5">
                      <span>Payment received</span>
                      <span className="text-primary font-semibold">62%</span>
                    </div>
                    <div className="h-2 rounded-full bg-border overflow-hidden">
                      <div className="h-full w-[62%] rounded-full bg-gradient-to-r from-primary/80 to-primary" />
                    </div>
                    <div className="flex justify-between text-micro text-muted-foreground mt-1.5">
                      <span>0.0031 sBTC paid</span>
                      <span>0.0019 remaining</span>
                    </div>
                  </div>

                  {/* Expiry */}
                  <div className="flex items-center gap-1.5 mb-4 text-micro text-muted-foreground">
                    <Clock className="h-3 w-3 shrink-0" />
                    <span>Expires in 23h 41m</span>
                  </div>

                  {/* CTA */}
                  <div className="h-10 rounded-lg bg-primary flex items-center justify-center gap-2 pointer-events-none">
                    <Bitcoin className="h-4 w-4 text-primary-foreground" />
                    <span className="text-body-sm font-semibold text-primary-foreground">Pay with Leather</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
