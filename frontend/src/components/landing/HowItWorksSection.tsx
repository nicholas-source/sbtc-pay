import { motion } from "framer-motion";
import { Wallet, Link2, Zap } from "lucide-react";

const STEPS = [
  {
    Icon: Wallet,
    title: "Connect & register",
    desc: "Link Leather or Xverse, then register your account on-chain — one transaction, about 10 seconds. No email, no password, no KYC.",
    color: "primary" as const,
  },
  {
    Icon: Link2,
    title: "Generate a payment link",
    desc: "Set the amount in sBTC or STX, choose an expiry, and configure partial payment thresholds in seconds.",
    color: "secondary" as const,
  },
  {
    Icon: Zap,
    title: "Receive funds on-chain",
    desc: "Anyone with sBTC pays directly into your wallet. One Stacks block — ~10 seconds — and it's final.",
    color: "primary" as const,
  },
];

const STYLE = {
  primary: {
    wrap: "bg-primary/10 border border-primary/20 text-primary",
    badge: "bg-primary text-primary-foreground",
  },
  secondary: {
    wrap: "bg-secondary/10 border border-secondary/20 text-secondary",
    badge: "bg-secondary text-secondary-foreground",
  },
};

export default function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-12 sm:py-16 md:py-24 relative">
      <div className="absolute inset-0 bg-surface-1/40" aria-hidden="true" />
      <div className="container relative">
        <motion.div
          className="text-center mb-12 md:mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-heading-lg sm:text-display font-display text-foreground">
            Up and running in{" "}
            <span className="text-primary">60 seconds</span>
          </h2>
          <p className="mt-4 text-body-lg text-muted-foreground max-w-lg mx-auto">
            No signups, no credit cards — just connect your wallet.
          </p>
        </motion.div>

        <div className="relative grid grid-cols-1 sm:grid-cols-3 gap-8 lg:gap-12">
          {/* Dashed connector line (desktop only) */}
          <div
            className="hidden sm:block absolute top-7 left-[calc(16.7%+36px)] right-[calc(16.7%+36px)] h-px border-t border-dashed border-border pointer-events-none"
            aria-hidden="true"
          />

          {STEPS.map((step, i) => {
            const s = STYLE[step.color];
            return (
              <motion.div
                key={step.title}
                className="flex flex-col items-center text-center"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.12, duration: 0.4 }}
              >
                <div className="relative mb-5">
                  <div className={`h-14 w-14 rounded-2xl flex items-center justify-center ${s.wrap}`}>
                    <step.Icon className="h-6 w-6" />
                  </div>
                  <div className={`absolute -top-2.5 -right-2.5 h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold leading-none ${s.badge}`}>
                    {i + 1}
                  </div>
                </div>
                <h3 className="text-heading-sm text-foreground mb-2">{step.title}</h3>
                <p className="text-body-sm text-muted-foreground max-w-[240px]">{step.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
