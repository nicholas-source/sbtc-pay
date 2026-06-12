import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Reveal } from "./Reveal";

interface FaqItem {
  q: string;
  a: string;
}

const FAQS: FaqItem[] = [
  {
    q: "Who is sBTC Pay for?",
    a: "Anyone who needs to receive sBTC or STX: creators getting paid for their work, freelancers invoicing clients, DAOs collecting contributions, SaaS apps billing subscriptions, and businesses accepting on-chain payments. If you have a Stacks wallet, you can register in a single on-chain transaction and start sharing payment links.",
  },
  {
    q: "Which wallets are supported?",
    a: "Leather and Xverse, the two leading Stacks wallets. Both are available as browser extensions and mobile apps. No wallet install? The payment page also shows a QR code so mobile users can pay directly.",
  },
  {
    q: "Which tokens can I accept?",
    a: "sBTC (Bitcoin on Stacks) and STX (the native Stacks token). You choose per-invoice or set a default in your dashboard. Customers can only pay with the token you specify.",
  },
  {
    q: "What happens if a customer only partially pays?",
    a: "The invoice stays open and tracks progress. You can configure a minimum threshold: payments below it are rejected on-chain. Above the threshold, partial payments are accepted and accumulated until the invoice is fully paid or expires.",
  },
  {
    q: "Are there chargebacks or disputes?",
    a: "No. Blockchain payments are cryptographically final. Once a Stacks block confirms the transaction, the funds are in your wallet and cannot be reversed by the customer, a bank, or sBTC Pay.",
  },
  {
    q: "What is the 0.5% fee and who receives it?",
    a: "A 0.5% platform fee is deducted automatically by the smart contract at the moment of payment, not billed separately. The fee goes to the sBTC Pay fee recipient address set in the contract. There are no monthly fees, no setup fees, and no hidden costs.",
  },
  {
    q: "How do recurring subscriptions work?",
    a: "Create subscription plans with a price and interval (daily, weekly, monthly, etc.). Subscribers sign up on-chain. Each renewal is an explicit on-chain transaction; there is no automatic pull from anyone's wallet. Subscribers stay in full control and can cancel at any time.",
  },
  {
    q: "Can I embed a payment widget on my existing website?",
    a: "Yes. The Widget Generator in your dashboard outputs a <script> tag and a data-sbtcpay element you paste into any HTML page, React app, or static site. A styled Pay button appears wherever you drop it and opens a payment modal on click. An <iframe> embed is also available if you'd rather show the widget inline.",
  },
  {
    q: "Why does the dashboard call me a \"merchant\"?",
    a: "It's the smart contract's term for any registered Stacks principal that can receive payments, not a description of who you are. Whether you're a creator, a freelancer, or a DAO, the contract and dashboard label every recipient a \"merchant.\"",
  },
];

function FaqRow({ item, isOpen, onToggle }: { item: FaqItem; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className={cn(
          "w-full flex items-center justify-between gap-4 py-5 text-left text-body font-medium transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm",
          isOpen ? "text-foreground" : "text-foreground/90",
        )}
      >
        <span>{item.q}</span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200", isOpen && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="answer"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <p className="pb-5 text-body-sm text-muted-foreground leading-relaxed">{item.a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// FAQPage structured data for rich results. Built from the same FAQS so the
// markup and the schema never drift. Lives on the landing page (where the FAQ
// is actually visible) and is baked into the prerendered HTML.
const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export default function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggle = (i: number) => setOpenIndex(openIndex === i ? null : i);

  return (
    <section id="faq" className="py-12 sm:py-16 md:py-24 relative">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <div className="absolute inset-0 bg-surface-1/40" aria-hidden="true" />
      <div className="container relative">
        <Reveal className="text-center mb-12 md:mb-16">
          <h2 className="text-heading-lg sm:text-display font-display text-foreground">
            Common questions
          </h2>
          <p className="mt-4 text-body-lg text-muted-foreground max-w-lg mx-auto">
            Everything you need to know before getting paid in sBTC.
          </p>
        </Reveal>

        <Reveal
          className="mx-auto max-w-2xl"
          from={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          {FAQS.map((item, i) => (
            <FaqRow
              key={item.q}
              item={item}
              isOpen={openIndex === i}
              onToggle={() => toggle(i)}
            />
          ))}
        </Reveal>
      </div>
    </section>
  );
}
