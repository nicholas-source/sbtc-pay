import { Link } from "react-router-dom";
import { DocsPage } from "../components/DocsPage";
import { CodeBlock, InlineCode } from "../components/CodeBlock";
import { Callout } from "../components/Callout";

export default function Notifications() {
  return (
    <DocsPage
      slug="notifications"
      section="For Merchants"
      title="Payment Notifications"
      description="Three ways to know when a payment lands — from zero-config (the dashboard) to full automation (polling or your own indexer)."
    >
      <p className="lead">
        When a payment hits your merchant wallet, you'll want to react — fulfill an order, grant access
        to a product, update your own database. This page covers the ways to do that today, and what's
        coming.
      </p>

      <h2>Option 1 — The dashboard (zero config)</h2>

      <p>
        The simplest way. Open the dashboard, keep the tab open, and payments appear in real time as
        their transactions confirm. Useful for low-volume businesses, sole operators, or during initial
        integration testing.
      </p>

      <p>Best for:</p>

      <ul>
        <li>Manual order fulfillment</li>
        <li>Early testing before you wire up automation</li>
        <li>Any merchant who doesn't need a backend system to react</li>
      </ul>

      <h2>Option 2 — Query the indexer from your backend</h2>

      <p>
        sBTC Pay indexes every payment into a Supabase Postgres database. You can query it directly
        from your backend with the Supabase JavaScript client — or any Postgres client — using your
        merchant wallet as the filter.
      </p>

      <CodeBlock
        filename="poll-payments.ts"
        language="typescript"
        code={`import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://kkkvlbdcgupesyzmmpqv.supabase.co", // mainnet
  process.env.SUPABASE_ANON_KEY!
);

// Fetch new invoice payments since the last check
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

      <p>Run this on a cron (every 30–60 seconds) and fulfill orders based on new rows.</p>

      <h3>Querying subscription payments</h3>

      <CodeBlock
        filename="subscription-payments.ts"
        language="typescript"
        code={`const { data } = await supabase
  .from("subscription_payments")
  .select("subscription_id, subscriber, amount, block_height, tx_id")
  .eq("merchant_principal", merchantAddress)
  .gt("block_height", sinceBlock);`}
      />

      <h3>Querying direct (non-invoice) payments</h3>

      <CodeBlock
        filename="direct-payments.ts"
        language="typescript"
        code={`const { data } = await supabase
  .from("direct_payments")
  .select("payer, amount, memo, block_height, tx_id")
  .eq("merchant_principal", merchantAddress)
  .gt("block_height", sinceBlock);`}
      />

      <Callout variant="tip" title="Use tx_id as your idempotency key">
        Every payment row has a unique <InlineCode>tx_id</InlineCode> (the Stacks transaction hash).
        Store it on your end and skip rows you've already processed. This makes your sync safe against
        retries, restarts, and duplicate polls.
      </Callout>

      <h3>Which mainnet / testnet URL?</h3>

      <ul>
        <li><strong>Mainnet:</strong> <InlineCode>kkkvlbdcgupesyzmmpqv.supabase.co</InlineCode></li>
        <li><strong>Testnet:</strong> <InlineCode>oggvlwdptcpwipxahhjn.supabase.co</InlineCode></li>
      </ul>

      <p>
        The anon key for each network is in the published frontend build — you can grab it from the
        browser dev tools of the dashboard, or ask us for it. Anon key only gives read access, so
        exposing it is safe.
      </p>

      <h2>Option 3 — Run your own Chainhook</h2>

      <p>
        For the lowest-latency, highest-reliability integration, subscribe your own server to Stacks
        contract events directly using Hiro Chainhook. Chainhook pushes events to a URL you control as
        soon as a block confirms.
      </p>

      <p>Benefits over polling:</p>

      <ul>
        <li>Sub-second latency from confirmation to your server</li>
        <li>No rate-limit concerns</li>
        <li>Handles rollbacks automatically</li>
      </ul>

      <p>
        See Hiro's{" "}
        <a href="https://docs.hiro.so/chainhook" target="_blank" rel="noopener noreferrer">
          Chainhook documentation
        </a>{" "}
        for setup. The predicate you'd register is the same shape as the one sBTC Pay uses for its
        indexer, pointed at the mainnet contract{" "}
        <InlineCode>SPR54P37AA27XHMMTCDEW4YZFPFJX69162JR5CT4.sbtc-pay</InlineCode>.
      </p>

      <h2>Outgoing webhooks (coming soon)</h2>

      <p>
        The merchant settings page has a <strong>Webhook URL</strong> field today, and the value is
        stored on your on-chain merchant record. <strong>Outbound webhook delivery from sBTC Pay to
        your URL is on the roadmap</strong> — the plumbing is in place, but the sender isn't live yet.
      </p>

      <Callout variant="warning" title="Don't rely on the webhook URL field yet">
        Filling in the webhook URL today stores the value but doesn't fire notifications. Use Option 2
        (polling) or Option 3 (self-hosted Chainhook) until outbound webhooks ship. When they do, the
        URL you've set will start receiving events automatically.
      </Callout>

      <p>When outbound webhooks go live, they'll include:</p>

      <ul>
        <li>Signed POST requests so your server can verify authenticity</li>
        <li>At-least-once delivery with retries</li>
        <li>A public key for signature verification</li>
        <li>Event types for every payment, refund, subscription lifecycle change</li>
      </ul>

      <h2>Which option should I pick?</h2>

      <ul>
        <li><strong>Just trying it out?</strong> Use the dashboard.</li>
        <li><strong>Need to react automatically but volume is low?</strong> Poll the indexer every 30 seconds.</li>
        <li><strong>Building a serious integration?</strong> Run your own Chainhook. Or wait for outbound webhooks if your volume is modest.</li>
      </ul>

      <p>
        See <Link to="/docs/architecture">Architecture</Link> for how the indexing layer works, and{" "}
        <Link to="/docs/contract">Smart Contract Reference</Link> for the event catalog.
      </p>
    </DocsPage>
  );
}
