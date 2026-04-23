import { Link } from "react-router-dom";
import { DocsPage } from "../components/DocsPage";
import { CodeBlock, InlineCode } from "../components/CodeBlock";
import { Callout } from "../components/Callout";

export default function Contract() {
  return (
    <DocsPage
      slug="contract"
      section="Reference"
      title="Smart Contract Reference"
      description="The on-chain surface of sBTC Pay. Function signatures, events, and where to find them on the explorer."
    >
      <p className="lead">
        sBTC Pay's entire protocol logic lives in a single Clarity contract. This page lists the
        public-facing functions, the events they emit, and where to read the full source.
      </p>

      <h2>Deployed addresses</h2>

      <ul>
        <li>
          <strong>Mainnet:</strong>{" "}
          <code>SPR54P37AA27XHMMTCDEW4YZFPFJX69162JR5CT4.sbtc-pay</code>
        </li>
        <li>
          <strong>Testnet:</strong>{" "}
          <code>STR54P37AA27XHMMTCDEW4YZFPFJX69160WQESWR.payment-v6</code>
        </li>
      </ul>

      <p>
        Both deployments come from the same Clarity source. You can inspect source and transaction
        history on the{" "}
        <a href="https://explorer.hiro.so" target="_blank" rel="noopener noreferrer">
          Hiro Explorer
        </a>
        .
      </p>

      <h2>Public functions</h2>

      <h3>Merchant management</h3>

      <CodeBlock
        language="clarity"
        code={`(register-merchant (name (string-ascii 64)))
(update-merchant
  (new-name (optional (string-ascii 64)))
  (new-description (optional (string-ascii 280)))
  (new-webhook-url (optional (string-ascii 256)))
  (new-logo-url (optional (string-ascii 256))))
(deactivate-merchant)
(reactivate-merchant)`}
      />

      <h3>Invoices</h3>

      <CodeBlock
        language="clarity"
        code={`(create-invoice
  (amount uint)
  (memo (string-ascii 280))
  (reference-id (optional (string-ascii 64)))
  (expires-in-blocks uint)
  (allow-partial bool)
  (allow-overpay bool)
  (token-type uint))
(update-invoice
  (invoice-id uint)
  (new-amount (optional uint))
  (new-memo (optional (string-ascii 280)))
  (new-expires-in-blocks (optional uint)))
(cancel-invoice (invoice-id uint))
(pay-invoice (invoice-id uint) (amount uint))`}
      />

      <h3>Subscriptions</h3>

      <CodeBlock
        language="clarity"
        code={`(create-subscription
  (merchant principal)
  (name (string-ascii 64))
  (amount uint)
  (interval-blocks uint)
  (token-type uint))
(process-subscription-payment (subscription-id uint))
(pause-subscription (subscription-id uint))
(resume-subscription (subscription-id uint))
(cancel-subscription (subscription-id uint))`}
      />

      <h3>Refunds</h3>

      <CodeBlock
        language="clarity"
        code={`(process-refund
  (invoice-id uint)
  (amount uint)
  (reason (string-ascii 280)))`}
      />

      <h3>Read-only (no fee)</h3>

      <CodeBlock
        language="clarity"
        code={`(get-merchant (principal principal))
(get-invoice (invoice-id uint))
(get-subscription (subscription-id uint))
(get-refund (refund-id uint))
(get-fee-rate)`}
      />

      <h2>Events</h2>

      <p>
        Every state-changing function emits a <InlineCode>print</InlineCode> event with a{" "}
        <InlineCode>(tuple ...)</InlineCode> payload. The webhook subscribes to these and indexes them
        into Postgres. The event's first field is always <InlineCode>event</InlineCode>, which
        identifies the type.
      </p>

      <ul>
        <li><InlineCode>merchant-registered</InlineCode></li>
        <li><InlineCode>merchant-updated</InlineCode></li>
        <li><InlineCode>merchant-deactivated</InlineCode> / <InlineCode>merchant-reactivated</InlineCode></li>
        <li><InlineCode>invoice-created</InlineCode></li>
        <li><InlineCode>invoice-updated</InlineCode></li>
        <li><InlineCode>invoice-cancelled</InlineCode></li>
        <li><InlineCode>invoice-expired</InlineCode></li>
        <li><InlineCode>payment-received</InlineCode></li>
        <li><InlineCode>direct-payment</InlineCode></li>
        <li><InlineCode>refund-processed</InlineCode></li>
        <li><InlineCode>subscription-created</InlineCode></li>
        <li><InlineCode>subscription-payment</InlineCode></li>
        <li><InlineCode>subscription-paused</InlineCode> / <InlineCode>subscription-resumed</InlineCode></li>
        <li><InlineCode>subscription-cancelled</InlineCode></li>
      </ul>

      <h2>Token types</h2>

      <p>Contract calls that move tokens accept a <InlineCode>token-type</InlineCode> uint:</p>

      <ul>
        <li><InlineCode>u0</InlineCode> — sBTC</li>
        <li><InlineCode>u1</InlineCode> — STX</li>
      </ul>

      <h2>Error codes</h2>

      <p>
        See the <Link to="/docs/errors">Error Codes</Link> page for the full catalog with plain-English
        explanations.
      </p>

      <h2>Reading source</h2>

      <p>
        The full Clarity source is in the open-source repository under{" "}
        <InlineCode>contracts/payment-v6.clar</InlineCode>. It's under 1,500 lines — readable in an
        hour. If you're evaluating for an audit or integration, reading the source is the most direct
        way to verify behavior.
      </p>

      <Callout variant="tip" title="Verifying deployed bytecode">
        The Hiro Explorer shows the deployed source verbatim — what you read there is exactly what
        runs on-chain. No hidden bytecode or proxies. You can also use{" "}
        <InlineCode>clarinet check</InlineCode> locally to verify the source compiles.
      </Callout>
    </DocsPage>
  );
}
