import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, CheckCircle2 } from "lucide-react";

const checkpoints = [
  "0.5% platform fee — the lowest in crypto payments",
  "No monthly fees, no hidden costs",
  "Settle directly to your wallet",
  "Real-time webhook notifications",
  "Embeddable payment widgets",
];

export default function PricingSection() {
  return (
    <section id="pricing" className="py-24 relative">
      <div className="absolute inset-0 bg-surface-1/50" />
      <div className="container relative">
        <motion.div
          className="mx-auto max-w-lg text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-display text-foreground">
            Simple, transparent{" "}
            <span className="text-primary">pricing</span>
          </h2>
          <p className="mt-4 text-body-lg text-muted-foreground">
            No subscriptions. No hidden fees. Just 0.5% per transaction.
          </p>
        </motion.div>

        <motion.div
          className="mt-12 mx-auto max-w-md"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.15 }}
        >
          <Card className="border-primary/30 relative overflow-hidden">
            <CardContent className="p-5 sm:p-8">
              <div className="text-center">
                <motion.div
                  className="text-4xl sm:text-display-lg md:text-display-xl text-primary font-black"
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                >
                  0.5%
                </motion.div>
                <p className="mt-2 text-body text-muted-foreground">per transaction</p>
              </div>

              <div className="mt-8 space-y-3">
                {checkpoints.map((c) => (
                  <div key={c} className="flex items-start gap-3 text-body-sm text-foreground">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-success mt-0.5" />
                    <span>{c}</span>
                  </div>
                ))}
              </div>

              <Button size="lg" className="w-full mt-8 h-12 gap-2 text-base" asChild>
                <Link to="/dashboard">
                  Start Accepting Payments
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </section>
  );
}
