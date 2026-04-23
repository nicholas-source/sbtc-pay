import { Link } from "react-router-dom";
import { DocsPage } from "../components/DocsPage";
import { CodeBlock, InlineCode } from "../components/CodeBlock";
import { Callout } from "../components/Callout";
import { PropTable } from "../components/PropTable";

export default function Subscriptions() {
  return (
    <DocsPage
      slug="subscriptions"
      section="For Merchants"
      title="Subscriptions"
      description="Recurring billing — daily, weekly, monthly, or any custom interval — all settled on-chain in sBTC or STX."
    >
      <p className="lead">
        A subscription is an agreement between a merchant and a subscriber: a fixed amount paid on a
        fixed cadence. The contract tracks when the next payment is due, and either the subscriber or
        any automation the merchant runs can trigger the payment once the interval has passed.
      </p>

      <h2>Key differences from a credit-card subscription</h2>

      <Callout variant="info" title="Pull vs. push">
        Traditional subscriptions are <strong>pull</strong>-based — the merchant charges the customer's
        saved card. On-chain subscriptions are <strong>push</strong>-based — each payment requires the
        subscriber (or a bot acting for them) to broadcast a transaction. This is a deliberate property
        of non-custodial rails: the merchant can never silently drain a subscriber's wallet.
      </Callout>

      <ul>
        <li>Subscriber retains full custody. Payments happen when they (or their agent) sign a TX.</li>
        <li>Missed payments are possible. Subscriber sees the next due date and is responsible for paying on time.</li>
        <li>Cancellation is instant and requires no merchant permission.</li>
      </ul>

      <h2>Creating a subscription plan</h2>

      <p>
        As a merchant, you don't create subscriptions directly — you create a <strong>subscription
        widget</strong> that your subscribers can use to opt in.
      </p>

      <p>
        From the dashboard, go to <strong>Widget Generator</strong> → <strong>Subscribe</strong>. Fill
        in:
      </p>

      <PropTable
        rows={[
          { name: "Plan name", type: "string", required: true, description: 'What the subscriber sees. E.g., "Pro Plan" or "Monthly Sponsor".' },
          { name: "Amount", type: "sats / micro-STX", required: true, description: "Amount charged each interval." },
          { name: "Interval", type: "daily | weekly | biweekly | monthly | quarterly | yearly", required: true, description: "How often the subscription bills." },
          { name: "Token", type: "sBTC | STX", required: true, description: "Which token the subscriber pays in." },
        ]}
      />

      <p>
        Copy the generated embed code (or URL) and put it on your pricing page. When a subscriber opens
        the widget, clicks <strong>Subscribe Now</strong>, and confirms the transaction, a subscription
        is created and registered on-chain.
      </p>

      <h2>Subscriber experience</h2>

      <p>After creating the subscription, subscribers use the <strong>Customer Portal</strong>:</p>

      <CodeBlock code="https://sbtc-pay-phi.vercel.app/customer/subscriptions" />

      <p>From the portal, a subscriber can:</p>

      <ul>
        <li>See all active subscriptions, with next-payment date and amount</li>
        <li>Make the next payment when it's due</li>
        <li>Pause a subscription (stops the billing clock)</li>
        <li>Resume a paused subscription</li>
        <li>Cancel a subscription (terminal)</li>
      </ul>

      <h2>Subscription lifecycle</h2>

      <PropTable
        nameLabel="Status"
        rows={[
          { name: "Active", type: "0", description: "Currently billing. The contract tracks next-payment-at." },
          { name: "Paused", type: "1", description: "Temporarily stopped. Resume restarts from where it left off." },
          { name: "Cancelled", type: "2", description: "Terminal. Cannot be reactivated — subscriber must create a new one." },
        ]}
      />

      <h2>How payment timing works</h2>

      <p>
        The contract counts time in <strong>Bitcoin burn blocks</strong> (about 10 minutes each on
        mainnet, 5 minutes on testnet). When a subscription is created:
      </p>

      <ul>
        <li><InlineCode>created-at</InlineCode> = current burn block</li>
        <li><InlineCode>next-payment-at</InlineCode> = current burn block (first payment is due immediately)</li>
      </ul>

      <p>Each time a payment goes through:</p>

      <ul>
        <li><InlineCode>last-payment-at</InlineCode> = the burn block when payment confirmed</li>
        <li><InlineCode>next-payment-at</InlineCode> = last-payment-at + interval</li>
      </ul>

      <p>
        The contract blocks premature payments — if the subscriber tries to pay before{" "}
        <InlineCode>next-payment-at</InlineCode>, the transaction reverts with{" "}
        <InlineCode>ERR_NOT_DUE_YET</InlineCode>.
      </p>

      <Callout variant="info" title="Why burn blocks, not Stacks blocks?">
        After the Stacks Nakamoto upgrade, Stacks blocks are fast (~5 seconds). Using them for billing
        intervals would mean "monthly" actually hits every ~7 hours. Burn blocks match Bitcoin's steady
        ~10-minute cadence, which gives predictable calendar-time intervals. See{" "}
        <Link to="/docs/timing">Burn-Block Timing</Link> for the full explanation.
      </Callout>

      <h2>Pause and resume</h2>

      <p>
        A subscriber can pause a subscription at any time. While paused, no payments can be made and the
        clock doesn't advance. When the subscription is resumed, the contract recalculates the next
        payment date:
      </p>

      <CodeBlock
        language="pseudocode"
        code={`proper-next = last-payment-at + interval-blocks
next-at     = max(current-burn-block, proper-next)`}
      />

      <p>
        In plain English: "catch up if you're behind, otherwise keep the original schedule." This means
        a subscriber who pauses mid-period doesn't lose their remaining time.
      </p>

      <h2>Cancellation</h2>

      <p>
        Cancellation is terminal and requires no merchant approval. Once cancelled, the subscription
        cannot be reactivated — the subscriber must create a new one if they want to resubscribe.
        Cancelled subscriptions remain in the dashboard for historical reference.
      </p>

      <h2>Dashboard view</h2>

      <p>
        As a merchant, go to <strong>Subscriptions</strong> in the dashboard to see:
      </p>

      <ul>
        <li>Active subscriber count</li>
        <li>Monthly recurring revenue (MRR) in sBTC and STX</li>
        <li>Per-subscription history: payments made, last payment date, status</li>
      </ul>

      <h2>Refunding a subscription payment</h2>

      <p>
        Individual subscription payments can be refunded like any other payment. See{" "}
        <Link to="/docs/refunds">Processing Refunds</Link>.
      </p>
    </DocsPage>
  );
}
