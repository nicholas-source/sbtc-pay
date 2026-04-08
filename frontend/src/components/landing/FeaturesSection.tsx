import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import {
  Shield,
  Zap,
  RefreshCcw,
  Repeat,
  Code,
  SplitSquareHorizontal,
} from "lucide-react";

const features = [
  { icon: SplitSquareHorizontal, title: "Partial Payments", desc: "Accept partial payments with progress tracking and automatic reconciliation.", color: "primary" as const },
  { icon: RefreshCcw, title: "Instant Refunds", desc: "Full or partial refunds with complete audit trail and on-chain transparency.", color: "secondary" as const },
  { icon: Repeat, title: "Subscriptions", desc: "Recurring billing with pause, resume, and cancel — all trustlessly on-chain.", color: "primary" as const },
  { icon: Shield, title: "No Chargebacks", desc: "Immutable blockchain payments mean zero fraud risk and zero disputes.", color: "secondary" as const },
  { icon: Zap, title: "Instant Settlement", desc: "Funds arrive directly to your wallet. No intermediaries, no holding periods.", color: "primary" as const },
  { icon: Code, title: "Developer First", desc: "Embeddable widgets, webhooks, and a clean API for seamless integration.", color: "secondary" as const },
];

const colorClasses = {
  primary: { bg: "bg-primary/15 group-hover:bg-primary/25", text: "text-primary" },
  secondary: { bg: "bg-secondary/15 group-hover:bg-secondary/25", text: "text-secondary" },
};

export default function FeaturesSection() {
  return (
    <section id="features" className="py-24 relative">
      <div className="container">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-display text-foreground">
            Everything you need to{" "}
            <span className="text-secondary">accept sBTC</span>
          </h2>
          <p className="mt-4 text-body-lg text-muted-foreground max-w-xl mx-auto">
            A complete payment platform designed for modern businesses.
          </p>
        </motion.div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08, duration: 0.4 }}
            >
              <Card className="h-full group">
                <CardContent className="p-6">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${colorClasses[f.color].bg} ${colorClasses[f.color].text} mb-4 transition-colors`}>
                    <f.icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-heading-sm text-foreground mb-2">{f.title}</h3>
                  <p className="text-body-sm text-muted-foreground">{f.desc}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
