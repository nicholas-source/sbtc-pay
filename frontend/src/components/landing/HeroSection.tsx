import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Bitcoin, ArrowRight } from "lucide-react";

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
    <section id="main-content" className="relative pt-32 pb-24 lg:pt-44 lg:pb-32">
      <div className="absolute inset-0 bg-grid opacity-40" />
      <div className="absolute top-20 left-1/4 h-96 w-96 rounded-full bg-primary/8 blur-[120px] animate-pulse-glow" />
      <div className="absolute bottom-10 right-1/4 h-80 w-80 rounded-full bg-stacks/8 blur-[100px] animate-pulse-glow" style={{ animationDelay: "1.5s" }} />

      <div className="container relative">
        <motion.div
          className="mx-auto max-w-3xl text-center"
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.12 } } }}
        >
          <motion.div variants={fadeUp} custom={0}>
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-caption font-semibold text-primary">
              <Bitcoin className="h-3.5 w-3.5" />
              Powered by Stacks & sBTC
            </span>
          </motion.div>

          <motion.h1
            variants={fadeUp}
            custom={1}
            className="mt-6 text-display-xl tracking-tight"
          >
            Accept Bitcoin payments.{" "}
            <span className="text-gradient-orange">Built on Stacks.</span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            custom={2}
            className="mt-6 text-body-lg text-muted-foreground max-w-xl mx-auto"
          >
            Enterprise-grade invoicing with partial payments, refunds, recurring subscriptions,
            and embeddable widgets — all trustlessly on the blockchain.
          </motion.p>

          <motion.div variants={fadeUp} custom={3} className="mt-8 flex items-center justify-center gap-4">
            <Button size="lg" className="gap-2 text-base h-12 px-6" asChild>
              <Link to="/dashboard">
                Get Started
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" className="h-12 px-6 text-base" asChild>
              <a href="#features">Learn More</a>
            </Button>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
