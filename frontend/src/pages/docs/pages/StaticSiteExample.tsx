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
      description="A copy-paste integration for a plain HTML site — no framework, no build step, no backend. You can ship this in 5 minutes."
    >
      <p className="lead">
        This example is the simplest possible integration. One HTML file, one iframe, a success state
        your customers can see. Good for landing pages, donation pages, simple Gumroad-style checkout
        flows, or any static site.
      </p>

      <h2>What you'll build</h2>

      <p>
        A single page with a "Pay 0.001 sBTC" button. When clicked, the sBTC Pay widget opens inline.
        Your customer connects a wallet, pays, and sees a success state. No backend required.
      </p>

      <h2>Prerequisites</h2>

      <ol>
        <li>
          A registered merchant account with a wallet address. If you haven't registered yet, follow
          the <Link to="/docs/quickstart">Quickstart</Link>.
        </li>
        <li>Your merchant wallet address (something that starts with <InlineCode>SP...</InlineCode> on mainnet or <InlineCode>ST...</InlineCode> on testnet).</li>
        <li>A static HTML file you can edit (or a Gumroad/Carrd/Notion site that allows HTML embeds).</li>
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
    .container {
      text-align: center;
      max-width: 480px;
      padding: 2rem;
    }
    h1 { font-size: 2rem; margin-bottom: 1rem; }
    p  { color: #8a8a8a; margin-bottom: 2rem; }
    button {
      background: #f7931a;
      color: #0a0b10;
      border: 0;
      padding: 0.875rem 2rem;
      font-weight: 600;
      border-radius: 10px;
      cursor: pointer;
      font-size: 1rem;
    }
    button:hover { background: #ffa33a; }
    iframe {
      border: 0;
      border-radius: 12px;
      width: 100%;
      max-width: 420px;
      height: 520px;
      margin-top: 1.5rem;
      display: none;
    }
    iframe.visible { display: block; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Support the project</h1>
    <p>Chip in 0.001 sBTC to keep the lights on.</p>
    <button id="pay-btn" type="button">Pay with sBTC</button>
    <iframe
      id="pay-widget"
      title="sBTC payment widget"
      allow="clipboard-write"
    ></iframe>
  </div>

  <script>
    // ===== CONFIGURE THIS =====
    const MERCHANT = "SP1234...REPLACE_WITH_YOUR_ADDRESS";
    const AMOUNT_SATS = 100000;                  // 0.001 sBTC
    const MEMO = "Thank you!";
    const ENV = "mainnet";                       // or "testnet"
    // ==========================

    const base = ENV === "mainnet"
      ? "https://sbtc-pay-phi.vercel.app"
      : "https://sbtc-pay-testnet.vercel.app";

    const params = new URLSearchParams({
      amount: String(AMOUNT_SATS),
      token:  "sbtc",
      memo:   MEMO,
    });
    const widgetUrl = \`\${base}/widget/\${MERCHANT}?\${params}\`;

    const btn    = document.getElementById("pay-btn");
    const iframe = document.getElementById("pay-widget");

    btn.addEventListener("click", () => {
      iframe.src = widgetUrl;
      iframe.classList.add("visible");
      btn.style.display = "none";
      iframe.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  </script>
</body>
</html>`}
      />

      <h2>Step 2 — Customize the config block</h2>

      <p>
        At the top of the <InlineCode>&lt;script&gt;</InlineCode>, replace the three config values:
      </p>

      <ul>
        <li>
          <strong><InlineCode>MERCHANT</InlineCode></strong> — your Stacks wallet address. Start with{" "}
          <InlineCode>SP</InlineCode> for mainnet, <InlineCode>ST</InlineCode> for testnet.
        </li>
        <li>
          <strong><InlineCode>AMOUNT_SATS</InlineCode></strong> — the amount in sats (1 sBTC =
          100,000,000 sats). Set to 100000 for 0.001 sBTC.
        </li>
        <li>
          <strong><InlineCode>ENV</InlineCode></strong> — use{" "}
          <InlineCode>"testnet"</InlineCode> while building, flip to{" "}
          <InlineCode>"mainnet"</InlineCode> when going live.
        </li>
      </ul>

      <h2>Step 3 — Preview locally</h2>

      <p>Open the file in a browser. You'll see:</p>

      <ol>
        <li>A dark page with an orange "Pay with sBTC" button</li>
        <li>Click the button — the widget slides in below</li>
        <li>Click "Connect Wallet" in the widget — Leather or Xverse prompts</li>
        <li>Approve the payment — widget shows confirmation with TX hash</li>
      </ol>

      <p>
        If the widget shows a blank state, check the browser console. The most common issue is a typo
        in the merchant address (wrong network prefix).
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
        Start with <InlineCode>ENV = "testnet"</InlineCode> and a testnet merchant address. Test the
        full flow with free testnet tokens from the faucet. Flip to mainnet only when you've seen a
        successful testnet payment flow end-to-end.
      </Callout>

      <h2>Accepting multiple amounts</h2>

      <p>Swap the single button for a set of preset amount buttons:</p>

      <CodeBlock
        language="html"
        code={`<div class="amount-picker">
  <button data-amount="50000">0.0005 sBTC</button>
  <button data-amount="100000">0.001 sBTC</button>
  <button data-amount="500000">0.005 sBTC</button>
</div>

<script>
  document.querySelectorAll("[data-amount]").forEach(btn => {
    btn.addEventListener("click", () => {
      const amount = btn.dataset.amount;
      iframe.src = \`\${base}/widget/\${MERCHANT}?amount=\${amount}&token=sbtc\`;
      iframe.classList.add("visible");
    });
  });
</script>`}
      />

      <h2>Handling successful payments</h2>

      <p>
        The widget shows its own success state inside the iframe. For a static site, you don't need to
        do anything further — customers see the confirmation and the payment is already in your
        dashboard. For more advanced flows (redirect after payment, send a receipt email), you'll want
        a backend — see the <Link to="/docs/notifications">Payment Notifications</Link> page for how
        to react programmatically.
      </p>

      <h2>What's next?</h2>

      <ul>
        <li>Swap the direct payment for an <Link to="/docs/widgets">invoice widget</Link> if you need a specific order ID</li>
        <li>Add <Link to="/docs/subscriptions">a subscription button</Link> for recurring billing</li>
        <li>Build a real backend that reacts to payments via <Link to="/docs/notifications">polling or Chainhook</Link></li>
      </ul>
    </DocsPage>
  );
}
