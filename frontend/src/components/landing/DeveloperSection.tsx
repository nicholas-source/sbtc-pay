import { useState } from "react";
import { Reveal } from "./Reveal";
import { Link } from "react-router-dom";
import { Code, Copy, Check, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const SNIPPET = `<!-- Load the SDK once per page -->
<script src="https://sbtc-pay.com/sbtcpay.js" async></script>

<!-- Drop a Pay button anywhere -->
<div data-sbtcpay="invoice" data-sbtcpay-invoice="123"></div>`;

const BENEFITS = [
  "Works in any HTML page, React, Vue, or plain site",
  "Real-time payment status via webhooks + window events",
  "Customisable token, amount, memo, expiry",
  "Generate the code instantly in your dashboard",
];

export default function DeveloperSection() {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(SNIPPET);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="py-12 sm:py-16 md:py-24">
      <div className="container">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          {/* Left — description */}
          <Reveal from={{ opacity: 0, x: -20 }} transition={{ duration: 0.5 }}>
            <span className="inline-flex items-center gap-2 rounded-full border border-secondary/30 bg-secondary/10 px-3 py-1.5 text-caption font-semibold text-secondary mb-4">
              <Code className="h-3.5 w-3.5" />
              Developer First
            </span>
            <h2 className="text-heading-lg sm:text-display font-display text-foreground mb-4">
              One script tag.{" "}
              <span className="text-secondary">Any website.</span>
            </h2>
            <p className="text-body-lg text-muted-foreground mb-6">
              Drop in the SDK, add a <code className="font-mono text-secondary">data-sbtcpay</code>{" "}
              attribute, and a styled Pay button appears wherever you want it. Click opens a modal
              — no backend, no build step, no layout work.
            </p>
            <ul className="flex flex-col gap-3 mb-8">
              {BENEFITS.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-body-sm text-foreground">
                  <div className="h-5 w-5 rounded-full bg-secondary/15 flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="h-3 w-3 text-secondary" />
                  </div>
                  {item}
                </li>
              ))}
            </ul>
            <Button variant="outline" size="lg" className="h-12 gap-2 px-6" asChild>
              <Link to="/docs/widgets">
                Read the Docs <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </Reveal>

          {/* Right — syntax-highlighted code block */}
          <Reveal from={{ opacity: 0, x: 20 }} transition={{ duration: 0.5, delay: 0.1 }}>
            <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-xl">
              {/* Toolbar */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
                  <div className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
                  <div className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
                </div>
                <span className="text-caption text-muted-foreground font-mono">embed.html</span>
                <button
                  onClick={handleCopy}
                  aria-label={copied ? "Copied" : "Copy code"}
                  className="flex items-center gap-1.5 text-caption text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-success" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              {/* Code */}
              <pre className="p-5 text-caption font-mono overflow-x-auto leading-6">
                <span className="text-muted-foreground/50">{`<!-- Load the SDK once per page -->\n`}</span>
                <span className="text-secondary">{`<script `}</span>
                <span className="text-foreground">{`src`}</span><span className="text-muted-foreground">{`=`}</span><span className="text-primary">{`"https://sbtc-pay.com/sbtcpay.js"`}</span>
                <span className="text-foreground">{` async`}</span>
                <span className="text-secondary">{`></script>`}</span>{`\n\n`}
                <span className="text-muted-foreground/50">{`<!-- Drop a Pay button anywhere -->\n`}</span>
                <span className="text-secondary">{`<div `}</span>
                <span className="text-foreground">{`data-sbtcpay`}</span><span className="text-muted-foreground">{`=`}</span><span className="text-primary">{`"invoice"`}</span>
                <span className="text-foreground">{` data-sbtcpay-invoice`}</span><span className="text-muted-foreground">{`=`}</span><span className="text-primary">{`"123"`}</span>
                <span className="text-secondary">{`></div>`}</span>
              </pre>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
