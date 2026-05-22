import { motion } from "framer-motion";

// Focus on what's user-relevant (which wallets work) rather than listing
// the tech stack. "Powered by Bitcoin / Stacks / sBTC" reads as filler;
// "Works with Leather / Xverse" tells a visitor what they actually need.
const WALLETS = ["Leather", "Xverse"] as const;

export default function TrustSection() {
  return (
    <section aria-label="Supported wallets" className="py-6 border-y border-border/40">
      <div className="container">
        <motion.div
          className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-10"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-caption text-muted-foreground uppercase tracking-widest shrink-0">
            Works with
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
            {WALLETS.map((label) => (
              <span key={label} className="text-body-sm font-semibold text-foreground">
                {label}
              </span>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
