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
        Widgets are the fastest way to accept payments on your own site. Each widget is an iframe that
        handles wallet connection, payment, and confirmation — so you don't write any payment code
        yourself. Just drop in an <InlineCode>&lt;iframe&gt;</InlineCode> tag.
      </p>

      <h2>Why iframe?</h2>

      <p>
        sBTC Pay widgets use iframe embedding (the same approach as Stripe Elements and Square Web
        Payments SDK). This choice gives you two important properties:
      </p>

      <ul>
        <li>
          <strong>Customer wallet data stays in sBTC Pay's domain.</strong> Your page's JavaScript
          can't accidentally read or leak payment details.
        </li>
        <li>
          <strong>Your page's styling can't break the widget UI.</strong> A buggy CSS rule on your
          checkout page won't corrupt the wallet prompt.
        </li>
      </ul>

      <Callout variant="info" title="Planning a tighter integration?">
        A JS SDK with an inline modal (like <InlineCode>stripe.js</InlineCode>) is on the roadmap for
        when merchants ask for deeper customization. For v1, the iframe covers the common cases.
      </Callout>

      <h2>The three variants</h2>

      <h3>1. Direct payment</h3>

      <p>
        For when you want a fixed-amount payment button anywhere on your site — donation pages, tip
        jars, simple digital-good checkouts.
      </p>

      <CodeBlock
        filename="Direct payment widget"
        language="html"
        code={`<iframe
  src="https://sbtc-pay-phi.vercel.app/widget/{MERCHANT_ADDRESS}?amount=10000&token=sbtc&memo=Coffee"
  width="100%"
  height="520"
  frameborder="0"
  style="border-radius:12px;max-width:420px;"
  allow="clipboard-write"
></iframe>`}
      />

      <p>No invoice is created — the payment goes straight into your merchant wallet.</p>

      <h3>2. Invoice payment</h3>

      <p>
        For checkout flows where you generate an invoice per order. Create the invoice via the
        dashboard (or, later, via API), then embed the widget with that invoice ID:
      </p>

      <CodeBlock
        filename="Invoice widget"
        language="html"
        code={`<iframe
  src="https://sbtc-pay-phi.vercel.app/widget/invoice/{INVOICE_ID}"
  width="100%"
  height="520"
  frameborder="0"
  style="border-radius:12px;max-width:420px;"
></iframe>`}
      />

      <p>
        The widget pulls amount, memo, and status directly from the invoice record on-chain. If the
        invoice is already paid, expired, or cancelled, the widget shows the appropriate state.
      </p>

      <h3>3. Subscription</h3>

      <p>
        For recurring billing. Puts a subscribe button on your pricing page — when a customer clicks it,
        the subscription is created on-chain and appears in their Customer Portal.
      </p>

      <CodeBlock
        filename="Subscription widget"
        language="html"
        code={`<iframe
  src="https://sbtc-pay-phi.vercel.app/widget/subscribe/{MERCHANT_ADDRESS}?plan=Pro&amount=50000&interval=monthly&token=sbtc"
  width="100%"
  height="520"
  frameborder="0"
  style="border-radius:12px;max-width:420px;"
></iframe>`}
      />

      <h2>Generating embed codes</h2>

      <p>
        The easiest way is the <strong>Widget Generator</strong> in your dashboard — it produces a
        ready-to-paste iframe snippet. Or build the URL yourself using the{" "}
        <Link to="/docs/widget-parameters">URL Parameters reference</Link>.
      </p>

      <h2>Customization</h2>

      <p>Widget size is controlled by the iframe's <InlineCode>width</InlineCode> and <InlineCode>height</InlineCode> attributes. For best results:</p>

      <ul>
        <li><strong>Min width:</strong> 320px</li>
        <li><strong>Recommended width:</strong> 420px</li>
        <li><strong>Min height:</strong> 480px (accounts for wallet prompts)</li>
        <li><strong>Recommended height:</strong> 520px</li>
      </ul>

      <p>
        Use <InlineCode>border-radius</InlineCode> on the iframe to match your site's design system. The
        widget's internal theme is dark — if your site is light-themed, wrap the iframe in a dark
        card to visually contain it.
      </p>

      <h2>What the customer sees</h2>

      <ol>
        <li><strong>Connect wallet</strong> — if they don't have one, we link to Leather/Xverse install</li>
        <li><strong>Balance check</strong> — widget confirms they have enough sBTC/STX</li>
        <li><strong>Confirm payment</strong> — wallet prompt; they approve in their wallet extension</li>
        <li><strong>Pending confirmation</strong> — shows the TX hash and a link to the block explorer</li>
        <li><strong>Success</strong> — confirmation UI with receipt details</li>
      </ol>

      <h2>Testing your embed</h2>

      <p>
        Use the testnet URLs during development. Switch to mainnet URLs only when you're ready to accept
        real Bitcoin. The dashboard URL changes too:
      </p>

      <ul>
        <li><strong>Testnet dashboard:</strong> <InlineCode>sbtc-pay-testnet.vercel.app</InlineCode></li>
        <li><strong>Mainnet dashboard:</strong> <InlineCode>sbtc-pay-phi.vercel.app</InlineCode></li>
      </ul>

      <h2>Self-hosting the widget</h2>

      <p>
        sBTC Pay is open source. If you'd rather host the widget yourself (for example, to put it on
        your own subdomain), clone the repository and deploy the frontend to Vercel or your preferred
        host. The contract and indexing layer you connect to can still be our hosted ones — only the
        UI is self-hosted.
      </p>
    </DocsPage>
  );
}
