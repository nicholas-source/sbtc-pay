import { Link } from "react-router-dom";
import { ArrowRight, Bitcoin, Code2, LayoutGrid, Repeat, Shield, Zap } from "lucide-react";
import { DocsPage } from "../components/DocsPage";
import { Callout } from "../components/Callout";

export default function Introduction() {
  return (
    <DocsPage
      slug=""
      section="Get Started"
      title="Introduction"
      description="sBTC Pay is a Stacks-native payment platform that lets merchants accept sBTC and STX with Stripe-style ergonomics. This guide takes you from never heard of it to first live payment."
    >
      <p className="lead">
        If you've used Stripe, PayPal, or Paddle, sBTC Pay will feel familiar. The difference: settlement
        happens on the Stacks blockchain, funds move in <strong>sBTC</strong> (Bitcoin) or <strong>STX</strong>,
        and there is no custodian sitting between you and your customer.
      </p>

      <h2>What you can build</h2>

      <div className="my-space-lg grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[
          { icon: Bitcoin, title: "One-time payments", body: "Direct wallet-to-wallet transfers or invoice-based checkout with partial and overpay support." },
          { icon: Repeat, title: "Subscriptions", body: "Recurring billing with pause, resume, cancel, and pro-rated intervals — all on-chain." },
          { icon: LayoutGrid, title: "Embeddable widgets", body: "Drop three copy-paste widgets onto any site. No backend required on the merchant side." },
          { icon: Shield, title: "Refunds & disputes", body: "Full and partial refunds within a bounded window, with transparent on-chain record." },
        ].map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-lg border border-border bg-card p-4">
            <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
            <p className="mt-2 font-semibold text-foreground">{title}</p>
            <p className="mt-1 text-body-sm text-muted-foreground">{body}</p>
          </div>
        ))}
      </div>

      <h2>Who this is for</h2>

      <ul>
        <li>
          <strong>Merchants</strong> — online stores, content creators, SaaS founders, donation pages.
          Anyone who wants to accept Bitcoin without signing up for a custodial processor.
        </li>
        <li>
          <strong>Developers integrating sBTC Pay</strong> — you need a widget that drops into a checkout
          page and handles wallet connection, payment, and confirmation.
        </li>
        <li>
          <strong>Auditors and technical evaluators</strong> — the{" "}
          <Link to="/docs/architecture">architecture guide</Link> and{" "}
          <Link to="/docs/contract">contract reference</Link> explain exactly what runs on-chain.
        </li>
      </ul>

      <h2>How sBTC Pay is different</h2>

      <ul>
        <li>
          <strong>Non-custodial.</strong> Funds move directly from customer wallet to merchant wallet.
          sBTC Pay never holds your money.
        </li>
        <li>
          <strong>Bitcoin-settled.</strong> sBTC is 1:1 Bitcoin. Merchants receive the same asset that
          settles the rails, not a stablecoin proxy.
        </li>
        <li>
          <strong>Transparent.</strong> Every invoice, payment, subscription, and refund is a verifiable
          on-chain record. You can audit the whole history with a block explorer.
        </li>
        <li>
          <strong>Open.</strong> Contract is public. Frontend is open source. You can self-host the
          widget or run your own indexer.
        </li>
      </ul>

      <Callout variant="tip" title="Not sure if sBTC Pay fits?">
        If you need <strong>fiat payouts</strong> or <strong>credit card acceptance</strong>, this isn't
        the right tool. sBTC Pay is Bitcoin in, Bitcoin out. For fiat rails, use a traditional processor.
      </Callout>

      <h2>What to read next</h2>

      <p>Pick the path that matches you:</p>

      <div className="not-prose my-space-lg grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          to="/docs/quickstart"
          className="group flex flex-col gap-2 rounded-lg border border-border bg-card p-5 transition hover:border-primary/60"
        >
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <span className="font-semibold text-foreground">Start here →</span>
          </div>
          <p className="text-body-sm text-muted-foreground">
            10-minute Quickstart: from no account to first live payment on testnet.
          </p>
          <span className="mt-auto inline-flex items-center gap-1 text-caption text-primary group-hover:underline">
            Quickstart <ArrowRight className="h-3 w-3" />
          </span>
        </Link>

        <Link
          to="/docs/architecture"
          className="group flex flex-col gap-2 rounded-lg border border-border bg-card p-5 transition hover:border-primary/60"
        >
          <div className="flex items-center gap-2">
            <Code2 className="h-4 w-4 text-primary" />
            <span className="font-semibold text-foreground">Technical evaluation</span>
          </div>
          <p className="text-body-sm text-muted-foreground">
            How the contract, indexer, and frontend fit together. The layer model.
          </p>
          <span className="mt-auto inline-flex items-center gap-1 text-caption text-primary group-hover:underline">
            Architecture <ArrowRight className="h-3 w-3" />
          </span>
        </Link>
      </div>
    </DocsPage>
  );
}
