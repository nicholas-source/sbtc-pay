import { Link } from "react-router-dom";
import { DocsPage } from "../components/DocsPage";
import { CodeBlock, InlineCode } from "../components/CodeBlock";
import { Callout } from "../components/Callout";
import { PropTable } from "../components/PropTable";

export default function Notifications() {
  return (
    <DocsPage
      slug="notifications"
      section="For Merchants"
      title="Payment Notifications"
      description="Three ways to know when a payment lands — outbound webhooks (push), polling the indexer (pull), or running your own Chainhook."
    >
      <p className="lead">
        When a payment hits your merchant wallet, you'll want to react — fulfill an order, grant access
        to a product, update your own database. This page covers all three mechanisms, with real
        code.
      </p>

      <h2>Option 1 — Outbound webhooks (recommended)</h2>

      <p>
        Set a <strong>Webhook URL</strong> in your merchant Settings. sBTC Pay sends a signed
        HTTPS POST to that URL every time an on-chain event happens for your merchant — payment
        received, subscription created, refund processed, and so on.
      </p>

      <Callout variant="tip" title="Why this is the recommended path">
        Push delivery means your system reacts in seconds, not minutes. No polling loop to maintain,
        no rate limits to worry about, and retries are handled automatically.
      </Callout>

      <h3>Setup</h3>

      <ol>
        <li>In your Dashboard → <strong>Settings</strong>, set <strong>Webhook URL</strong> under Profile Details and save (this writes the URL on-chain).</li>
        <li>Scroll to the <strong>Webhook Delivery</strong> card and click <strong>Regenerate Secret</strong>. <strong>Copy the secret immediately</strong> — it's only shown once.</li>
        <li>Store the secret in your server environment (e.g. <InlineCode>SBTCPAY_WEBHOOK_SECRET</InlineCode>).</li>
        <li>Click <strong>Send Test</strong> — your endpoint should receive a <InlineCode>test.ping</InlineCode> event within a second or two.</li>
      </ol>

      <h3>Request format</h3>

      <p>Every webhook is a POST with a JSON body and three signature headers:</p>

      <PropTable
        nameLabel="Header"
        rows={[
          { name: "X-SbtcPay-Event", type: "string", description: "Event type (e.g. payment-received, subscription-created)" },
          { name: "X-SbtcPay-Signature", type: "string", description: "HMAC-SHA256 signature: t=<timestamp>,v1=<hex>. See verification below." },
          { name: "X-SbtcPay-Delivery", type: "string", description: "Delivery ID — useful for correlation with the dashboard log" },
          { name: "Content-Type", type: "string", description: "Always application/json" },
          { name: "User-Agent", type: "string", description: "sBTCPay-Webhook/1.0" },
        ]}
      />

      <h3>Payload</h3>

      <CodeBlock
        filename="POST body"
        language="json"
        code={`{
  "id": "evt_12345",
  "type": "payment-received",
  "tx_id": "0xabc...",
  "block_height": 812345,
  "merchant": "SP1234...",
  "created": 1714680000,
  "data": {
    "event": "payment-received",
    "invoice-id": 42,
    "payer": "SP5678...",
    "merchant": "SP1234...",
    "amount": 100000,
    "fee": 500,
    "merchant-received": 99500,
    "total-paid": 100000,
    "status": 2,
    "block-height": 812345,
    "token-type": 0
  }
}`}
      />

      <p>
        <InlineCode>data</InlineCode> contains the decoded Clarity event exactly as it was emitted
        by the contract. See <Link to="/docs/contract">Smart Contract Reference</Link> for the full
        event catalog.
      </p>

      <h3>Verifying the signature</h3>

      <p>
        Every request includes <InlineCode>X-SbtcPay-Signature: t=&lt;timestamp&gt;,v1=&lt;hex&gt;</InlineCode>. To
        verify:
      </p>

      <ol>
        <li>Parse <InlineCode>t</InlineCode> and <InlineCode>v1</InlineCode> from the header.</li>
        <li>Reject if <InlineCode>|now - t|</InlineCode> &gt; 5 minutes (prevents replay).</li>
        <li>Compute <InlineCode>HMAC-SHA256(secret, `${"{"}t{"}"}.${"{"}raw_body{"}"}`)</InlineCode>.</li>
        <li>Compare to <InlineCode>v1</InlineCode> with a constant-time comparison.</li>
      </ol>

      <CodeBlock
        filename="verify.ts"
        language="typescript"
        code={`import { createHmac, timingSafeEqual } from "node:crypto";

export function verifySbtcPaySignature(
  rawBody: string,          // Exactly the raw request body — don't re-stringify!
  signatureHeader: string,  // Value of X-SbtcPay-Signature
  secret: string,           // Your SBTCPAY_WEBHOOK_SECRET
): boolean {
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => p.split("=") as [string, string])
  );
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!t || !v1) return false;

  // Reject stale (> 5 min skew) — prevents replay
  if (Math.abs(Date.now() / 1000 - t) > 300) return false;

  const expected = createHmac("sha256", secret)
    .update(\`\${t}.\${rawBody}\`)
    .digest("hex");

  // Constant-time compare
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  return a.length === b.length && timingSafeEqual(a, b);
}`}
      />

      <Callout variant="warning" title="Use the raw body, not JSON.stringify(req.body)">
        Most frameworks re-serialize parsed JSON, which changes whitespace and breaks the signature.
        Capture the raw body before it's parsed. In Express: <InlineCode>express.raw({"{"} type: "application/json" {"}"})</InlineCode>. In Next.js: read <InlineCode>req.body</InlineCode> as a stream in the API route.
      </Callout>

      <h3>Your endpoint should...</h3>

      <ul>
        <li>Respond <strong>2xx</strong> within 10 seconds to acknowledge delivery.</li>
        <li>Treat every event as potentially duplicate — use <InlineCode>tx_id + type</InlineCode> as an idempotency key.</li>
        <li>Respond <strong>4xx</strong> if you permanently reject the payload (we stop retrying).</li>
        <li>Respond <strong>5xx</strong> or timeout if transient — we'll retry.</li>
      </ul>

      <h3>Retry behavior</h3>

      <p>If your endpoint fails or times out, we retry up to 5 times with this schedule:</p>

      <ul>
        <li>Attempt 1: immediately on event</li>
        <li>Attempt 2: + 1 minute</li>
        <li>Attempt 3: + 5 minutes</li>
        <li>Attempt 4: + 30 minutes</li>
        <li>Attempt 5: + 2 hours</li>
      </ul>

      <p>
        After 5 failed attempts, the delivery is marked <strong>Failed</strong> permanently. You can
        see the full delivery log in Dashboard → Settings → Webhook Delivery, with HTTP status codes
        and error messages for each attempt.
      </p>

      <h3>Event types</h3>

      <p>Every on-chain event that touches your merchant record fires a webhook:</p>

      <ul>
        <li><InlineCode>merchant-registered</InlineCode>, <InlineCode>merchant-updated</InlineCode></li>
        <li><InlineCode>invoice-created</InlineCode>, <InlineCode>invoice-updated</InlineCode>, <InlineCode>invoice-cancelled</InlineCode>, <InlineCode>invoice-expired</InlineCode></li>
        <li><InlineCode>payment-received</InlineCode>, <InlineCode>direct-payment</InlineCode></li>
        <li><InlineCode>refund-processed</InlineCode></li>
        <li><InlineCode>subscription-created</InlineCode>, <InlineCode>subscription-payment</InlineCode></li>
        <li><InlineCode>subscription-paused</InlineCode>, <InlineCode>subscription-resumed</InlineCode>, <InlineCode>subscription-cancelled</InlineCode></li>
        <li><InlineCode>test.ping</InlineCode> (only when you hit Send Test)</li>
      </ul>

      <h2>Option 2 — Poll the indexer</h2>

      <p>
        If you'd rather not run an HTTPS endpoint, you can query the Supabase Postgres database
        directly with the Supabase JS client (or any Postgres client), using your merchant wallet as
        the filter.
      </p>

      <CodeBlock
        filename="poll-payments.ts"
        language="typescript"
        code={`import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://kkkvlbdcgupesyzmmpqv.supabase.co", // mainnet
  process.env.SUPABASE_ANON_KEY!
);

async function fetchNewPayments(merchantAddress: string, sinceBlock: number) {
  const { data, error } = await supabase
    .from("payments")
    .select("id, invoice_id, payer, amount, block_height, tx_id, token_type")
    .eq("merchant_principal", merchantAddress)
    .gt("block_height", sinceBlock)
    .order("block_height", { ascending: true });

  if (error) throw error;
  return data;
}`}
      />

      <p>
        Run this on a cron (every 30–60 seconds). Store the highest <InlineCode>block_height</InlineCode>{" "}
        you've seen and pass it on the next call.
      </p>

      <h3>Which URL?</h3>

      <ul>
        <li><strong>Mainnet:</strong> <InlineCode>kkkvlbdcgupesyzmmpqv.supabase.co</InlineCode></li>
        <li><strong>Testnet:</strong> <InlineCode>oggvlwdptcpwipxahhjn.supabase.co</InlineCode></li>
      </ul>

      <p>
        The anon key is in the published frontend build (safe to expose — it only gives read
        access subject to row-level security).
      </p>

      <Callout variant="tip" title="Use tx_id as your idempotency key">
        Every payment row has a unique <InlineCode>tx_id</InlineCode>. Store it and skip rows
        you've already processed — this makes your sync safe against retries and duplicate polls.
      </Callout>

      <h2>Option 3 — Run your own Chainhook</h2>

      <p>
        The lowest-latency option: subscribe your own server to Stacks contract events directly via
        Hiro Chainhook. You get raw events the moment a block confirms.
      </p>

      <p>Benefits:</p>

      <ul>
        <li>Sub-second latency</li>
        <li>Full event stream (not filtered to your merchant)</li>
        <li>Handles rollbacks natively</li>
      </ul>

      <p>
        See Hiro's{" "}
        <a href="https://docs.hiro.so/chainhook" target="_blank" rel="noopener noreferrer">
          Chainhook documentation
        </a>{" "}
        for setup. The predicate is the same shape sBTC Pay uses, pointed at{" "}
        <InlineCode>SPR54P37AA27XHMMTCDEW4YZFPFJX69162JR5CT4.sbtc-pay</InlineCode>.
      </p>

      <h2>Which should I pick?</h2>

      <ul>
        <li><strong>Just trying it out?</strong> Watch the dashboard.</li>
        <li><strong>Building any real integration?</strong> Outbound webhooks (Option 1).</li>
        <li><strong>Already running infrastructure for blockchain events?</strong> Self-hosted Chainhook (Option 3).</li>
        <li><strong>Can't accept incoming HTTPS?</strong> Polling (Option 2).</li>
      </ul>

      <p>
        See <Link to="/docs/architecture">Architecture</Link> for how the indexing layer works, and{" "}
        <Link to="/docs/contract">Smart Contract Reference</Link> for the full event catalog.
      </p>
    </DocsPage>
  );
}
