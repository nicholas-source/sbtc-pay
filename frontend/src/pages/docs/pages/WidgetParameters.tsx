import { DocsPage } from "../components/DocsPage";
import { CodeBlock } from "../components/CodeBlock";
import { PropTable } from "../components/PropTable";
import { Callout } from "../components/Callout";

export default function WidgetParameters() {
  return (
    <DocsPage
      slug="widget-parameters"
      section="Embedding"
      title="Widget URL Parameters"
      description="Full reference for every URL parameter each widget accepts."
    >
      <p className="lead">
        Each widget reads configuration from the URL. You can build widget URLs yourself — no SDK
        required. This page documents every parameter for each widget type.
      </p>

      <h2>Direct payment widget</h2>

      <p>URL shape:</p>

      <CodeBlock code="https://sbtc-pay-phi.vercel.app/widget/{MERCHANT_ADDRESS}?<params>" />

      <PropTable
        rows={[
          { name: "merchantAddress", type: "path segment", required: true, description: "Stacks address of the merchant receiving the payment." },
          { name: "amount", type: "integer", required: true, description: "Amount in base units (sats for sBTC, micro-STX for STX)." },
          { name: "token", type: "sbtc | stx", defaultValue: "sbtc", description: "Which token to pay with." },
          { name: "memo", type: "string", description: "Short description shown to the customer. Max 280 chars." },
          { name: "theme", type: "dark | light", defaultValue: "dark", description: "Widget color theme (light is reserved for future use)." },
        ]}
      />

      <h3>Example</h3>

      <CodeBlock code="https://sbtc-pay-phi.vercel.app/widget/SP1234ABC...?amount=50000&token=sbtc&memo=Monthly+coffee" />

      <h2>Invoice widget</h2>

      <p>URL shape:</p>

      <CodeBlock code="https://sbtc-pay-phi.vercel.app/widget/invoice/{INVOICE_ID}" />

      <PropTable
        rows={[
          { name: "invoiceId", type: "path segment (integer)", required: true, description: "Numeric invoice ID or human-readable form (e.g., INV-42)." },
        ]}
      />

      <p>
        The invoice widget doesn't take amount or token parameters — those are read from the invoice
        record on-chain. This guarantees the widget can't show a different amount than what's due.
      </p>

      <h3>Example</h3>

      <CodeBlock code="https://sbtc-pay-phi.vercel.app/widget/invoice/42" />

      <h2>Subscription widget</h2>

      <p>URL shape:</p>

      <CodeBlock code="https://sbtc-pay-phi.vercel.app/widget/subscribe/{MERCHANT_ADDRESS}?<params>" />

      <PropTable
        rows={[
          { name: "merchantAddress", type: "path segment", required: true, description: "Stacks address of the merchant offering the subscription." },
          { name: "plan", type: "string", defaultValue: "Standard Plan", description: "Display name for the plan. Shown to subscribers." },
          { name: "amount", type: "integer", required: true, description: "Amount per billing interval, in base units." },
          { name: "interval", type: "daily | weekly | biweekly | monthly | quarterly | yearly", defaultValue: "monthly", description: "Billing cadence. Converted to burn-block count based on the network." },
          { name: "token", type: "sbtc | stx", defaultValue: "sbtc", description: "Which token the subscription is billed in." },
        ]}
      />

      <h3>Example</h3>

      <CodeBlock code="https://sbtc-pay-phi.vercel.app/widget/subscribe/SP1234ABC...?plan=Pro+Plan&amount=500000&interval=monthly&token=sbtc" />

      <Callout variant="tip" title="Custom intervals">
        The interval parameter accepts either a preset name (<code>monthly</code>) or a raw burn-block
        count (<code>4320</code>). This lets you define non-standard cadences like "every 10 days" if
        your product needs them.
      </Callout>

      <h2>URL encoding</h2>

      <p>
        Remember to URL-encode parameter values that contain spaces or special characters. Most
        languages have a built-in helper:
      </p>

      <CodeBlock
        language="javascript"
        code={`const url = new URL("https://sbtc-pay-phi.vercel.app/widget/SP1234...");
url.searchParams.set("amount", "50000");
url.searchParams.set("memo", "Tip for great article");
url.searchParams.set("token", "sbtc");
// url.toString() gives a properly encoded URL`}
      />

      <h2>iframe best practices</h2>

      <p>Always include these iframe attributes for best results:</p>

      <CodeBlock
        language="html"
        code={`<iframe
  src="..."
  width="100%"
  height="520"
  frameborder="0"
  style="border-radius:12px; max-width:420px;"
  allow="clipboard-write"
></iframe>`}
      />

      <ul>
        <li><strong><code>allow="clipboard-write"</code></strong> — lets the widget copy TX hashes on success</li>
        <li><strong><code>frameborder="0"</code></strong> — removes the default 2px browser border</li>
        <li><strong><code>max-width:420px</code></strong> — prevents awkward stretching on wide viewports</li>
      </ul>
    </DocsPage>
  );
}
