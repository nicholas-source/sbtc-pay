import { Reveal } from "./Reveal";
import { Card, CardContent } from "@/components/ui/card";
import {
  Shield,
  Zap,
  RefreshCcw,
  Repeat,
  Code,
  SplitSquareHorizontal,
} from "lucide-react";

// Two crypto-native advantages get spotlight tiles — they're the real reason
// to leave a card processor, so they earn the space. The rest are breadth.
const spotlights = [
  {
    icon: Shield,
    title: "No Chargebacks",
    desc: "Once a payment confirms on-chain, the money is yours to keep; it can't be clawed back weeks later the way a card charge can. Zero fraud risk, zero disputes.",
    color: "primary" as const,
  },
  {
    icon: Zap,
    title: "Instant Settlement",
    desc: "Funds land in your wallet the moment a payment confirms in about ten seconds, instead of the two-to-seven-day payout wait you'd get from a card processor.",
    color: "secondary" as const,
  },
];

const features = [
  { icon: SplitSquareHorizontal, title: "Partial Payments", desc: "Accept partial payments with progress tracking and automatic reconciliation.", color: "primary" as const },
  { icon: RefreshCcw, title: "Instant Refunds", desc: "Full or partial refunds with complete audit trail and on-chain transparency.", color: "secondary" as const },
  { icon: Repeat, title: "Subscriptions", desc: "Recurring billing with pause, resume, and cancel, all trustlessly on-chain.", color: "primary" as const },
  { icon: Code, title: "Developer First", desc: "Drop in a script tag. Listen for webhooks. Ship in an afternoon.", color: "secondary" as const },
];

const colorClasses = {
  primary: { bg: "bg-primary/15 group-hover:bg-primary/25", text: "text-primary", ghost: "text-primary/[0.07]" },
  secondary: { bg: "bg-secondary/15 group-hover:bg-secondary/25", text: "text-secondary", ghost: "text-secondary/[0.07]" },
};

export default function FeaturesSection() {
  return (
    <section id="features" className="py-12 sm:py-16 md:py-24 relative">
      <div className="container">
        <Reveal className="text-center mb-8 sm:mb-12 md:mb-16">
          <h2 className="text-heading-lg sm:text-display font-display text-foreground">
            Everything you need to{" "}
            <span className="text-secondary">get paid in sBTC.</span>
          </h2>
          <p className="mt-4 text-body-lg text-muted-foreground max-w-xl mx-auto">
            Invoices, subscriptions, refunds, embeds: all the boring parts, handled.
          </p>
        </Reveal>

        {/* Spotlight tiles — the two reasons to switch, given room to breathe */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-md">
          {spotlights.map((f, i) => {
            const c = colorClasses[f.color];
            return (
              <Reveal key={f.title} from={{ opacity: 0, y: 20 }} transition={{ delay: i * 0.08, duration: 0.4 }}>
                <Card className="relative h-full overflow-hidden group">
                  <CardContent className="relative z-[1] p-6 sm:p-8">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${c.bg} ${c.text} transition-colors`}>
                      <f.icon className="h-6 w-6" />
                    </div>
                    <h3 className="mt-5 mb-2 text-heading text-foreground">{f.title}</h3>
                    <p className="text-body text-muted-foreground max-w-md">{f.desc}</p>
                  </CardContent>
                  {/* Oversized watermark of the same glyph — depth without a stat template */}
                  <f.icon className={`pointer-events-none absolute -bottom-8 -right-8 h-40 w-40 ${c.ghost}`} aria-hidden="true" strokeWidth={1.25} />
                </Card>
              </Reveal>
            );
          })}
        </div>

        {/* Supporting features — compact, denser, clearly secondary */}
        <div className="mt-space-md grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-md">
          {features.map((f, i) => {
            const c = colorClasses[f.color];
            return (
              <Reveal key={f.title} from={{ opacity: 0, y: 20 }} transition={{ delay: i * 0.06, duration: 0.4 }}>
                <Card className="h-full group">
                  <CardContent className="p-5">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${c.bg} ${c.text} mb-4 transition-colors`}>
                      <f.icon className="h-4 w-4" />
                    </div>
                    <h3 className="mb-1.5 text-heading-sm text-foreground">{f.title}</h3>
                    <p className="text-body-sm text-muted-foreground">{f.desc}</p>
                  </CardContent>
                </Card>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
