import { Link } from "react-router-dom";
import { DocsPage } from "../components/DocsPage";
import { CodeBlock, InlineCode } from "../components/CodeBlock";
import { Callout } from "../components/Callout";

export default function Widgets() {
  return (
    <DocsPage
      slug="widgets"
      section="Embedding"
      title="Widget Overview"
      description="Three widget variants cover the common checkout patterns. Pick the one that matches your use case."
    >
      <p className="lead">
        Widgets are the fastest way to accept payments on your own site. Drop in a script tag and a
        target element, and a styled Pay button appears that opens a payment modal when clicked. No
        payment code on your end.
      </p>

      <h2>Quick start</h2>

      <p>
        Add the SDK to your page once, then drop a <InlineCode>data-sbtcpay</InlineCode> attribute
        anywhere you want a Pay button:
      </p>

      <CodeBlock
        filename="Invoice payment"
        language="html"
        code={`<!-- 1. Load the SDK once per page (use async) -->
<script src="https://sbtc-pay.com/sbtcpay.js" async></script>

<!-- 2. Drop a Pay button anywhere -->
<div data-sbtcpay="invoice" data-sbtcpay-invoice="123"></div>`}
      />

      <p>
        The SDK scans for <InlineCode>[data-sbtcpay]</InlineCode> elements on load (and again on DOM
        changes for SPAs), renders a styled button into each one, and opens a modal payment dialog
        on click. The dialog runs the existing sBTC Pay widget inside a sandboxed iframe — your page
        never touches wallet data.
      </p>

      <Callout variant="info" title="Two integration modes">
        The script tag is the recommended path — it gives you a polished Pay button + modal flow.
        If you need the widget inline in the page (no click trigger), the bare iframe still works
        — see <Link to="/docs/widget-parameters">URL Parameters</Link>.
      </Callout>

      <h2>The three widget variants</h2>

      <h3>1. Direct payment</h3>

      <p>
        Fixed-amount payment button — donation pages, tip jars, simple digital-good checkouts. No
        invoice is created; the payment goes straight into your merchant wallet.
      </p>

      <CodeBlock
        filename="Direct payment button"
        language="html"
        code={`<div
  data-sbtcpay="direct"
  data-sbtcpay-merchant="SP1ABC...XYZ"
  data-sbtcpay-amount="100000"
  data-sbtcpay-token="sbtc"
  data-sbtcpay-memo="Coffee tip"
></div>`}
      />

      <h3>2. Invoice payment</h3>

      <p>
        Per-order checkout. Create an invoice via your dashboard (or the API), then embed a button
        with that invoice ID. The widget pulls amount, memo, and status directly from on-chain.
      </p>

      <CodeBlock
        filename="Invoice payment button"
        language="html"
        code={`<div data-sbtcpay="invoice" data-sbtcpay-invoice="123"></div>`}
      />

      <h3>3. Subscription</h3>

      <p>
        Recurring billing. Puts a Subscribe button on your pricing page — when a customer clicks,
        the subscription is created on-chain and appears in their Customer Portal.
      </p>

      <CodeBlock
        filename="Subscription button"
        language="html"
        code={`<div
  data-sbtcpay="subscribe"
  data-sbtcpay-merchant="SP1ABC...XYZ"
  data-sbtcpay-plan="Pro"
  data-sbtcpay-amount="50000"
  data-sbtcpay-interval="monthly"
  data-sbtcpay-token="sbtc"
></div>`}
      />

      <h2>Listening for events (declarative)</h2>

      <p>
        When you use the <InlineCode>data-sbtcpay</InlineCode> attribute to auto-mount a Pay
        button, you can still observe payment events by listening for{" "}
        <InlineCode>CustomEvent</InlineCode>s on <InlineCode>window</InlineCode>:
      </p>

      <CodeBlock
        filename="Listen for events from auto-mounted buttons"
        language="html"
        code={`<div data-sbtcpay="invoice" data-sbtcpay-invoice="123"></div>

<script src="https://sbtc-pay.com/sbtcpay.js" async></script>
<script>
  window.addEventListener('sbtcpay:success', (e) => {
    // e.detail = { mode, txId, invoiceId? }
    console.log('Paid', e.detail.txId);
    // e.g. fire analytics, redirect, refresh inventory
  });

  window.addEventListener('sbtcpay:error', (e) => {
    console.error(e.detail.message);
  });

  window.addEventListener('sbtcpay:close', (e) => {
    console.log('User closed the modal (mode:', e.detail.mode, ')');
  });
</script>`}
      />

      <h2>Programmatic API</h2>

      <p>
        Once <InlineCode>sbtcpay.js</InlineCode> loads, a global <InlineCode>SBTCPay</InlineCode>{" "}
        object is available. Use it to open the modal from your own JS (e.g. after a custom
        action), and to receive success / error / close callbacks:
      </p>

      <CodeBlock
        filename="Open modal from JS, listen for events"
        language="html"
        code={`<button id="checkout">Checkout</button>

<script src="https://sbtc-pay.com/sbtcpay.js" async></script>
<script>
  document.getElementById('checkout').addEventListener('click', () => {
    SBTCPay.open({
      mode: 'invoice',
      invoiceId: 123,
      onSuccess: ({ txId, invoiceId }) => {
        console.log('Paid', txId, invoiceId);
        // e.g. redirect to thank-you page
        window.location.href = '/thank-you?tx=' + txId;
      },
      onError: ({ message }) => console.error(message),
      onClose: () => console.log('User closed the modal'),
    });
  });
</script>`}
      />

      <h2>Button label override</h2>

      <p>Override the default Pay button text with <InlineCode>data-sbtcpay-label</InlineCode>:</p>

      <CodeBlock
        filename="Custom label"
        language="html"
        code={`<div
  data-sbtcpay="direct"
  data-sbtcpay-merchant="SP1ABC...XYZ"
  data-sbtcpay-amount="500000"
  data-sbtcpay-label="Buy me a coffee ☕"
></div>`}
      />

      <h2>Data attribute reference</h2>

      <table className="w-full text-sm">
        <thead>
          <tr><th className="text-left">Attribute</th><th className="text-left">Applies to</th><th className="text-left">Description</th></tr>
        </thead>
        <tbody>
          <tr><td><InlineCode>data-sbtcpay</InlineCode></td><td>all</td><td>Mode: <InlineCode>direct</InlineCode>, <InlineCode>invoice</InlineCode>, or <InlineCode>subscribe</InlineCode></td></tr>
          <tr><td><InlineCode>data-sbtcpay-merchant</InlineCode></td><td>direct, subscribe</td><td>Merchant Stacks principal</td></tr>
          <tr><td><InlineCode>data-sbtcpay-invoice</InlineCode></td><td>invoice</td><td>Numeric invoice ID</td></tr>
          <tr><td><InlineCode>data-sbtcpay-amount</InlineCode></td><td>direct, subscribe</td><td>Amount in base units (sats for sBTC, microSTX for STX)</td></tr>
          <tr><td><InlineCode>data-sbtcpay-token</InlineCode></td><td>direct, subscribe</td><td><InlineCode>sbtc</InlineCode> (default) or <InlineCode>stx</InlineCode></td></tr>
          <tr><td><InlineCode>data-sbtcpay-memo</InlineCode></td><td>direct</td><td>Optional memo string (max 200 chars)</td></tr>
          <tr><td><InlineCode>data-sbtcpay-plan</InlineCode></td><td>subscribe</td><td>Plan name shown to the customer</td></tr>
          <tr><td><InlineCode>data-sbtcpay-interval</InlineCode></td><td>subscribe</td><td>daily, weekly, biweekly, monthly, quarterly, yearly</td></tr>
          <tr><td><InlineCode>data-sbtcpay-label</InlineCode></td><td>all</td><td>Override the button text</td></tr>
          <tr><td><InlineCode>data-sbtcpay-theme</InlineCode></td><td>all</td><td><InlineCode>dark</InlineCode> (default) or <InlineCode>light</InlineCode></td></tr>
        </tbody>
      </table>

      <h2>Why a script tag (not just an iframe)?</h2>

      <p>
        Stripe-style integration: the script tag gives you a real button + modal flow that feels
        native to your site, instead of an embedded iframe block taking up page space. Under the
        hood, the payment UI still loads from sBTC Pay's domain inside a sandboxed iframe — so:
      </p>

      <ul>
        <li>
          <strong>Customer wallet data stays in sBTC Pay's domain.</strong> Your page's JS can't read
          or leak payment details.
        </li>
        <li>
          <strong>Your page's CSS can't break the widget.</strong> A buggy rule on your site won't
          corrupt the wallet prompt.
        </li>
        <li>
          <strong>SDK is small.</strong> The loader is a few KB of vanilla JS — React/wallet code
          only loads inside the iframe when the modal opens.
        </li>
      </ul>

      <h2>Self-hosting the widget</h2>

      <p>
        sBTC Pay is open source. To host the SDK yourself, clone the repo and serve{" "}
        <InlineCode>frontend/public/sbtcpay.js</InlineCode> from your domain. The script auto-detects
        the origin it was loaded from, so a script served from{" "}
        <InlineCode>testnet.sbtc-pay.com</InlineCode> opens the testnet widget; a script served from{" "}
        <InlineCode>sbtc-pay.com</InlineCode> opens mainnet.
      </p>

      <h2>Testing your embed</h2>

      <p>Use the testnet SDK during development. Switch to the mainnet URL only when you're ready to accept real Bitcoin:</p>

      <ul>
        <li><strong>Testnet:</strong> <InlineCode>https://testnet.sbtc-pay.com/sbtcpay.js</InlineCode></li>
        <li><strong>Mainnet:</strong> <InlineCode>https://sbtc-pay.com/sbtcpay.js</InlineCode></li>
      </ul>

      <h2>iframe (inline) — alternative</h2>

      <p>
        For when you need the payment UI visible in the page without a click trigger (e.g. a
        dedicated checkout page that is the payment surface), the bare iframe still works. The{" "}
        <Link to="/docs/widget-parameters">URL Parameters reference</Link> documents the iframe URL
        format. The Widget Generator in your dashboard outputs both formats.
      </p>
    </DocsPage>
  );
}
