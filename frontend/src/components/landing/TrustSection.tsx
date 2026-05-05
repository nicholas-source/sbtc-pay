import { motion } from "framer-motion";

const ECOSYSTEM: { label: string; accent: string }[] = [
  { label: "Bitcoin", accent: "text-primary" },
  { label: "Stacks", accent: "text-secondary" },
  { label: "sBTC", accent: "text-primary" },
  { label: "Leather Wallet", accent: "text-muted-foreground" },
  { label: "Xverse", accent: "text-muted-foreground" },
];

export default function TrustSection() {
  return (
    <section aria-label="Powered by" className="py-6 border-y border-border/40">
      <div className="container">
        <motion.div
          className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-10"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-caption text-muted-foreground uppercase tracking-widest shrink-0">
            Powered by
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
            {ECOSYSTEM.map((item) => (
              <span key={item.label} className={`text-body-sm font-semibold ${item.accent}`}>
                {item.label}
              </span>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
