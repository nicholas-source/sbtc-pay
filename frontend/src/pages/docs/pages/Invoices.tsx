import { Link } from "react-router-dom";
import { DocsPage } from "../components/DocsPage";
import { CodeBlock, InlineCode } from "../components/CodeBlock";
import { Callout } from "../components/Callout";
import { PropTable } from "../components/PropTable";

export default function Invoices() {
  return (
    <DocsPage
      slug="invoices"
      section="For Merchants"
      title="Creating Invoices"
      description="Invoices are one-time, addressable payment requests. Use them when you want a specific amount paid for a specific thing."
    >
      <p className="lead">
        Unlike direct payments (which accept any amount), an invoice has a fixed amount, an expiry, and
        optional rules for partial or overpayment. Each invoice is a record on-chain — you, your
        customer, and anyone else can verify its state with a block explorer.
      </p>

      <h2>Creating an invoice</h2>

      <p>From the dashboard:</p>

      <ol>
        <li>Go to <strong>Invoices</strong></li>
        <li>Click <strong>New Invoice</strong></li>
        <li>Fill in the form and confirm the transaction in your wallet</li>
      </ol>

      <p>Fields you'll fill in:</p>

      <PropTable
        rows={[
          { name: "Amount", type: "sats / micro-STX", required: true, description: "The exact amount due. For sBTC, 100,000,000 sats = 1 BTC. For STX, 1,000,000 micro-STX = 1 STX." },
          { name: "Token", type: "sBTC | STX", required: true, description: "Which token the customer pays in." },
          { name: "Memo", type: "string (max 280)", description: "Short description customers see on the payment page." },
          { name: "Reference ID", type: "string (max 64)", description: "Your internal order/reference ID. Useful for reconciliation." },
          { name: "Expires in", type: "burn blocks", defaultValue: "4320 (≈30 days)", description: "How long the invoice accepts payment before expiring. Counted in Bitcoin blocks." },
          { name: "Allow partial", type: "boolean", defaultValue: "false", description: "If true, customer can pay less than the full amount. Status becomes 'Partial' until total = amount." },
          { name: "Allow overpay", type: "boolean", defaultValue: "false", description: "If true, customer can pay more than the amount. Extra is treated as a tip." },
        ]}
      />

      <Callout variant="tip" title="Picking an expiry">
        The default is 30 days. For digital goods, 24 hours is usually enough. For invoices sent by email
        with a longer decision cycle, 7–30 days is typical. Shorter expiries reduce risk of price drift
        if Bitcoin moves significantly.
      </Callout>

      <h2>Invoice lifecycle</h2>

      <p>Every invoice moves through a defined set of states:</p>

      <PropTable
        nameLabel="Status"
        rows={[
          { name: "Pending", type: "0", description: "Created, no payment yet." },
          { name: "Partial", type: "1", description: "Received some payment, but less than the full amount. Only reachable if allowPartial = true." },
          { name: "Paid", type: "2", description: "Received full amount (or more, if allowOverpay = true). Terminal state for successful invoices." },
          { name: "Expired", type: "3", description: "Past the expiry block without being fully paid." },
          { name: "Cancelled", type: "4", description: "Merchant cancelled before any payment was made." },
          { name: "Refunded", type: "5", description: "After being paid, full amount was refunded to the customer." },
        ]}
      />

      <h2>Sharing an invoice with your customer</h2>

      <p>Every invoice has two shareable surfaces:</p>

      <h3>1. Public payment page</h3>

      <p>Send your customer this URL — they open it, connect their wallet, and pay:</p>

      <CodeBlock code="https://sbtc-pay-phi.vercel.app/pay/{invoiceId}" />

      <p>
        No code or embedding required. Works great in an email, Telegram message, or chat.
      </p>

      <h3>2. Embeddable invoice widget</h3>

      <p>
        For a checkout page where the invoice lives on your site, use the invoice widget. See{" "}
        <Link to="/docs/widgets">Widget Overview</Link> for full details.
      </p>

      <CodeBlock
        language="html"
        code={`<iframe
  src="https://sbtc-pay-phi.vercel.app/widget/invoice/{invoiceId}"
  width="100%"
  height="520"
  frameborder="0"
  style="border-radius:12px;"
></iframe>`}
      />

      <h2>Partial payments</h2>

      <p>
        If <InlineCode>allowPartial</InlineCode> is enabled, the invoice can accept multiple smaller
        payments until the total is reached. Each partial payment is its own on-chain transaction, and
        shows up as a separate row in the invoice's payment history.
      </p>

      <p>Use partial payments for:</p>

      <ul>
        <li>High-value invoices where the customer prefers to pay in tranches</li>
        <li>Milestone-based work (e.g., 30% deposit, 70% on delivery)</li>
        <li>Any case where exact-amount enforcement would be a bad UX</li>
      </ul>

      <h2>Overpayments</h2>

      <p>
        If <InlineCode>allowOverpay</InlineCode> is enabled, the customer can pay more than the invoice
        amount. The excess is treated as a tip and goes to the merchant along with the base amount. This
        is common for content creators and tip jars.
      </p>

      <Callout variant="warning" title="One or the other — usually">
        Partial and overpay are independent flags. It's valid to enable both, but this can produce
        confusing UX ("did I pay enough?"). Enabling just one is the usual pattern.
      </Callout>

      <h2>Cancelling and updating</h2>

      <p>
        Before any payment is made, you can <strong>cancel</strong> the invoice or <strong>update</strong>{" "}
        its amount, memo, or expiry. Once any payment arrives, the invoice is locked and can only be
        refunded.
      </p>

      <h2>Refunding</h2>

      <p>
        After an invoice is paid, you can refund it fully or partially. See{" "}
        <Link to="/docs/refunds">Processing Refunds</Link> for the full flow.
      </p>

      <h2>Fees</h2>

      <p>
        sBTC Pay takes a small protocol fee on every payment. The fee is deducted automatically — the
        merchant sees the net amount as <strong>merchant-received</strong> in the dashboard. Current fee
        schedule is on the landing page's pricing section.
      </p>
    </DocsPage>
  );
}
