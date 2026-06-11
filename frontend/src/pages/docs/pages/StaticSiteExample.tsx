import { Link } from "react-router-dom";
import { DocsPage } from "../components/DocsPage";
import { CodeBlock, InlineCode } from "../components/CodeBlock";
import { Callout } from "../components/Callout";

export default function StaticSiteExample() {
  return (
    <DocsPage
      slug="examples/static-site"
      section="Embedding"
      title="Static HTML Example"
      description="A copy-paste integration for a plain HTML site: no framework, no build step, no backend. You can ship this in 5 minutes."
    >
      <p className="lead">
        The simplest possible integration. One script tag, one button, a payment modal your customers
        can use. Good for landing pages, donation pages, simple Gumroad-style checkout flows,
        or any static site.
      </p>

      <h2>What you'll build</h2>

      <p>
        A single page with a styled "Pay with sBTC" button. When clicked, a payment modal opens,
        the customer connects a wallet and pays, and the payment lands in your dashboard. No JavaScript
        gymnastics, no backend required.
      </p>

      <h2>Prerequisites</h2>

      <ol>
        <li>
          A registered account with a wallet address. If you haven't registered yet, follow the{" "}
          <Link to="/docs/quickstart">Quickstart</Link>.
        </li>
        <li>
          Your registered Stacks address (starts with <InlineCode>SP...</InlineCode> on mainnet
          or <InlineCode>ST...</InlineCode> on testnet).
        </li>
        <li>A static HTML file you can edit (or any Carrd / Notion / Webflow / etc. site that allows HTML embeds).</li>
      </ol>

      <h2>Step 1 — The HTML</h2>

      <p>Save this as <InlineCode>index.html</InlineCode>:</p>

      <CodeBlock
        filename="index.html"
        language="html"
        code={`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Pay with sBTC</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      background: #0a0b10;
      color: #f5f5f0;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
    }
    .container { text-align: center; max-width: 480px; padding: 2rem; }
    h1 { font-size: 2rem; margin-bottom: 1rem; }
    p  { color: #8a8a8a; margin-bottom: 2rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Support the project</h1>
    <p>Chip in 0.001 sBTC to keep the lights on.</p>

    <!-- 1. Load the SDK once per page -->
    <script src="https://sbtc-pay.com/sbtcpay.js" async></script>

    <!-- 2. Drop a Pay button anywhere -->
    <div
      data-sbtcpay="direct"
      data-sbtcpay-merchant="SP1234...REPLACE_WITH_YOUR_ADDRESS"
      data-sbtcpay-amount="100000"
      data-sbtcpay-memo="Thank you!"
      data-sbtcpay-label="Pay 0.001 sBTC"
    ></div>
  </div>
</body>
</html>`}
      />

      <h2>Step 2 — Customize the data attributes</h2>

      <p>Replace the values on the <InlineCode>&lt;div&gt;</InlineCode>:</p>

      <ul>
        <li>
          <strong><InlineCode>data-sbtcpay-merchant</InlineCode></strong> — your Stacks address. Start
          with <InlineCode>SP</InlineCode> for mainnet, <InlineCode>ST</InlineCode> for testnet.
        </li>
        <li>
          <strong><InlineCode>data-sbtcpay-amount</InlineCode></strong> — the amount in sats
          (1 sBTC = 100,000,000 sats). <InlineCode>100000</InlineCode> = 0.001 sBTC.
        </li>
        <li>
          <strong><InlineCode>data-sbtcpay-memo</InlineCode></strong> — short description shown to
          the customer.
        </li>
        <li>
          <strong><InlineCode>data-sbtcpay-label</InlineCode></strong> — text on the Pay button.
          Optional; defaults to "Pay with sBTC".
        </li>
      </ul>

      <p>
        For the testnet version, swap the script src to{" "}
        <InlineCode>https://testnet.sbtc-pay.com/sbtcpay.js</InlineCode> — the SDK auto-detects which
        environment to open the widget on based on the script origin.
      </p>

      <h2>Step 3 — Preview locally</h2>

      <p>Open the file in a browser. You'll see:</p>

      <ol>
        <li>A dark page with a styled "Pay 0.001 sBTC" button</li>
        <li>Click the button — a modal opens with the payment widget</li>
        <li>Click "Connect wallet" — Leather or Xverse prompts</li>
        <li>Approve the payment — the widget shows confirmation with TX hash</li>
        <li>Modal auto-closes a couple seconds later</li>
      </ol>

      <p>
        If the modal doesn't open, check the browser console. The most common issue is a typo in the
        merchant address (wrong network prefix).
      </p>

      <h2>Step 4 — Deploy</h2>

      <p>Because it's just one HTML file, you can host it anywhere:</p>

      <ul>
        <li><strong>GitHub Pages:</strong> push to a repo, enable Pages — free</li>
        <li><strong>Netlify drop:</strong> drag the folder onto app.netlify.com/drop — free</li>
        <li><strong>Vercel:</strong> deploy as a static project — free</li>
        <li><strong>Cloudflare Pages:</strong> same idea — free</li>
        <li><strong>Your own server:</strong> just <InlineCode>scp</InlineCode> the file</li>
      </ul>

      <Callout variant="tip" title="Going from testnet to mainnet">
        Start with <InlineCode>https://testnet.sbtc-pay.com/sbtcpay.js</InlineCode> and a testnet
        Stacks address. Test the full flow with free testnet tokens from the faucet. Swap to the
        mainnet script URL only when you've seen a successful testnet payment end-to-end.
      </Callout>

      <h2>Accepting multiple amounts</h2>

      <p>
        Want preset amount buttons? Each one is just another <InlineCode>data-sbtcpay</InlineCode> div:
      </p>

      <CodeBlock
        language="html"
        code={`<script src="https://sbtc-pay.com/sbtcpay.js" async></script>

<div data-sbtcpay="direct"
     data-sbtcpay-merchant="SP1234..."
     data-sbtcpay-amount="50000"
     data-sbtcpay-label="0.0005 sBTC"></div>

<div data-sbtcpay="direct"
     data-sbtcpay-merchant="SP1234..."
     data-sbtcpay-amount="100000"
     data-sbtcpay-label="0.001 sBTC"></div>

<div data-sbtcpay="direct"
     data-sbtcpay-merchant="SP1234..."
     data-sbtcpay-amount="500000"
     data-sbtcpay-label="0.005 sBTC"></div>`}
      />

      <h2>Reacting to a successful payment</h2>

      <p>
        The widget shows its own success state inside the modal. For a static site, you usually don't
        need to do anything further. If you want to fire analytics or redirect on success, listen for
        the <InlineCode>sbtcpay:success</InlineCode> window event:
      </p>

      <CodeBlock
        language="html"
        code={`<script src="https://sbtc-pay.com/sbtcpay.js" async></script>
<script>
  window.addEventListener('sbtcpay:success', (e) => {
    // e.detail = { mode, txId, invoiceId? }
    console.log('Paid!', e.detail.txId);
    // e.g. redirect to a thank-you page
    window.location.href = '/thank-you?tx=' + e.detail.txId;
  });
</script>

<div data-sbtcpay="direct"
     data-sbtcpay-merchant="SP1234..."
     data-sbtcpay-amount="100000"></div>`}
      />

      <p>
        For more advanced backend flows (sending a receipt email, updating a database when a payment
        lands), see <Link to="/docs/notifications">Payment Notifications</Link>.
      </p>

      <h2>Want an inline iframe instead?</h2>

      <p>
        If you'd rather the payment widget render inline on the page (no click trigger, no modal),
        you can still use the raw iframe URL. See{" "}
        <Link to="/docs/widget-parameters">Widget URL Parameters</Link> for the iframe format.
      </p>

      <h2>What's next?</h2>

      <ul>
        <li>Swap the direct payment for an <Link to="/docs/widgets">invoice widget</Link> if you need a specific order ID</li>
        <li>Add <Link to="/docs/subscriptions">a subscription button</Link> for recurring billing</li>
        <li>Build a real backend that reacts to payments via <Link to="/docs/notifications">webhooks</Link></li>
      </ul>
    </DocsPage>
  );
}
