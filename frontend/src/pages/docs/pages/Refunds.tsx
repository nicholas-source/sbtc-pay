import { Link } from "react-router-dom";
import { DocsPage } from "../components/DocsPage";
import { InlineCode } from "../components/CodeBlock";
import { Callout } from "../components/Callout";

export default function Refunds() {
  return (
    <DocsPage
      slug="refunds"
      section="For Merchants"
      title="Processing Refunds"
      description="Issue full or partial refunds for any completed payment. All refunds are on-chain and auditable."
    >
      <p className="lead">
        A refund moves funds from the merchant's wallet back to the customer's wallet. You can refund
        partially (useful for price adjustments) or fully. There's a bounded refund window, so refunds
        can't be issued indefinitely after payment.
      </p>

      <h2>Issuing a refund</h2>

      <ol>
        <li>Go to <strong>Invoices</strong> in the dashboard</li>
        <li>Find the paid invoice and click it</li>
        <li>Click <strong>Refund</strong></li>
        <li>Enter the refund amount (can be less than the invoice amount for a partial refund)</li>
        <li>Optionally include a reason that gets recorded on-chain</li>
        <li>Confirm the transaction in your wallet</li>
      </ol>

      <p>
        When the transaction confirms, the funds move from your wallet back to the customer's wallet,
        and the invoice's <InlineCode>amount_refunded</InlineCode> increases.
      </p>

      <h2>Refund states on the invoice</h2>

      <ul>
        <li>
          <strong>Partial refund</strong> — if <InlineCode>amount_refunded &lt; amount_paid</InlineCode>,
          the invoice stays in its current status but records the partial refund.
        </li>
        <li>
          <strong>Full refund</strong> — when <InlineCode>amount_refunded ≥ amount_paid</InlineCode>,
          the invoice status changes to <strong>Refunded</strong> (status 5). This is terminal for the
          invoice.
        </li>
      </ul>

      <Callout variant="tip" title="Multiple partial refunds are supported">
        You can issue several partial refunds against the same invoice. The contract keeps a running
        total and only moves the invoice to "Refunded" when the full amount has been returned.
      </Callout>

      <h2>The refund window</h2>

      <p>
        Refunds can only be issued within a bounded window after the invoice's first payment. This
        prevents indefinite clawback and gives customers certainty that after enough time, funds are
        final.
      </p>

      <p>
        The window is measured in burn blocks from the <InlineCode>first-payment-at</InlineCode> block.
        Check the contract source for the exact constant — it's currently set to a value that gives
        merchants a comfortable window for dispute handling but not indefinite.
      </p>

      <h2>Subscription payment refunds</h2>

      <p>
        You can refund individual subscription payments the same way you refund invoice payments. Each
        subscription payment is an independent on-chain event — refunding one payment doesn't affect
        the rest of the subscription, and doesn't automatically cancel it.
      </p>

      <h2>What's recorded on-chain</h2>

      <p>Every refund emits a <InlineCode>refund-processed</InlineCode> event with:</p>

      <ul>
        <li>The refund ID (unique per refund)</li>
        <li>The invoice ID being refunded</li>
        <li>The amount refunded</li>
        <li>The reason (optional string you provide)</li>
        <li>The burn block at which the refund was processed</li>
      </ul>

      <p>
        This means anyone can audit the full refund history of a merchant with a block explorer — useful
        for transparency and dispute resolution.
      </p>

      <h2>Common scenarios</h2>

      <h3>Customer requested a return</h3>
      <p>Issue a full refund. Customer receives the full amount back, invoice marks as Refunded.</p>

      <h3>Customer wants a price adjustment</h3>
      <p>
        Issue a partial refund for the difference. Invoice remains Paid, but <InlineCode>amount_refunded</InlineCode>{" "}
        reflects the partial return.
      </p>

      <h3>Chargeback equivalent</h3>
      <p>
        In crypto there's no "chargeback" — the merchant controls the refund. If a customer disputes a
        charge, you have full discretion to refund or not. This means merchants take on the dispute
        burden that card networks normally handle — factor that into your fraud policy.
      </p>

      <h2>Errors you might hit</h2>

      <ul>
        <li>
          <strong>Refund window expired</strong> — the invoice is too old. See the{" "}
          <Link to="/docs/errors">Error Codes</Link> page for the exact constant.
        </li>
        <li>
          <strong>Insufficient balance</strong> — your merchant wallet doesn't have enough sBTC/STX to
          cover the refund. Top it up before retrying.
        </li>
        <li>
          <strong>Already fully refunded</strong> — someone (you, or an automated process) already
          refunded the full amount.
        </li>
      </ul>
    </DocsPage>
  );
}
