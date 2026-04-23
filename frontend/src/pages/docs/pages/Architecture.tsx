import { Link } from "react-router-dom";
import { DocsPage } from "../components/DocsPage";
import { CodeBlock, InlineCode } from "../components/CodeBlock";
import { Callout } from "../components/Callout";

export default function Architecture() {
  return (
    <DocsPage
      slug="architecture"
      section="Concepts"
      title="Architecture"
      description="The three-layer system that powers sBTC Pay — and why it isn't just a smart contract plus a frontend."
    >
      <p className="lead">
        sBTC Pay is structured as three layers: a Clarity smart contract (truth), an indexing layer
        (transformation), and a React frontend (experience). Each layer has one job. This separation is
        the reason the platform scales and the reason it's maintainable.
      </p>

      <h2>The three layers</h2>

      <pre className="my-space-lg overflow-x-auto rounded-lg border border-border bg-card p-4 font-mono text-body-sm leading-relaxed text-muted-foreground">
{`┌──────────────────────────────────────────┐
│  Layer 3 — Experience                    │
│  React frontend, widgets, dashboard      │
│  Fast, searchable, merchant-friendly     │
└──────────────────────────────────────────┘
                    ▲
                    │  (queries indexed data)
                    │
┌──────────────────────────────────────────┐
│  Layer 2 — Indexing                      │
│  Chainhook + Supabase webhook            │
│  Transforms events → queryable data      │
│  DLQ, rollback handling, idempotency     │
└──────────────────────────────────────────┘
                    ▲
                    │  (listens to on-chain events)
                    │
┌──────────────────────────────────────────┐
│  Layer 1 — Truth                         │
│  Clarity contract on Stacks mainnet      │
│  Source of truth for all money movement  │
└──────────────────────────────────────────┘`}
      </pre>

      <h2>Layer 1 — The contract (truth)</h2>

      <p>
        A single Clarity contract holds the entirety of the protocol's state and rules: merchant
        records, invoices, subscriptions, payments, refunds, and the fee schedule. Every action that
        moves money emits an event, and every event includes the <InlineCode>burn-block-height</InlineCode>{" "}
        at which it happened.
      </p>

      <p>Key properties:</p>

      <ul>
        <li><strong>Non-custodial.</strong> The contract never holds funds. It transfers directly between customer and merchant wallets at the moment of payment.</li>
        <li><strong>Deterministic.</strong> Given the same inputs, the same events are emitted in the same order.</li>
        <li><strong>Auditable.</strong> Source is public, state is queryable via any Stacks node.</li>
      </ul>

      <p>
        See <Link to="/docs/contract">Smart Contract Reference</Link> for the function catalog.
      </p>

      <h2>Layer 2 — The indexing layer (transformation)</h2>

      <p>
        Between the contract and the frontend sits an indexing layer. When the contract emits an event
        (e.g., <InlineCode>payment-received</InlineCode>), Hiro's Chainhook service picks it up and
        POSTs it to a Supabase edge function. The function normalizes the event into a Postgres row
        ready for the frontend to query.
      </p>

      <p>Why this matters:</p>

      <ul>
        <li>
          <strong>Aggregation queries.</strong> "Show my monthly revenue" becomes a SQL{" "}
          <InlineCode>SUM</InlineCode> — fast, no on-chain scanning.
        </li>
        <li>
          <strong>Search and filtering.</strong> Find invoice by reference ID, filter by status, sort
          by date — trivial with indexed columns, painful via read-only contract calls.
        </li>
        <li>
          <strong>Off-chain data.</strong> Webhook URLs, merchant descriptions, email receipts — these
          belong alongside the chain data, not on-chain.
        </li>
        <li>
          <strong>Real-time updates.</strong> Chainhook pushes events as blocks confirm, so the
          dashboard updates within seconds of a payment.
        </li>
      </ul>

      <h3>Reliability: DLQ and idempotency</h3>

      <p>
        Every payment handler writes to Postgres with{" "}
        <InlineCode>UPSERT ON CONFLICT (tx_id) DO NOTHING</InlineCode>. This means if the webhook
        retries an event — for example, because the first attempt timed out — the duplicate is a no-op.
        Events that fail processing land in a Dead-Letter Queue (DLQ) table for manual replay.
      </p>

      <p>
        Bitcoin reorgs (extremely rare on mainnet, but real) are handled via Chainhook's rollback
        events. When a block is reorged, the corresponding Postgres rows are deleted and aggregates
        recomputed.
      </p>

      <h2>Layer 3 — The frontend (experience)</h2>

      <p>
        A React + Vite SPA built with shadcn/ui components. It talks to Supabase for read queries, to
        Stacks wallets (Leather/Xverse) for signing, and to the contract via{" "}
        <InlineCode>@stacks/transactions</InlineCode> for broadcasts. The layer only reads data from
        the indexer — it never tries to derive state from raw chain scans.
      </p>

      <p>
        The same codebase ships to two Vercel projects (mainnet and testnet). Network is selected via
        environment variable at build time, so mainnet configuration can never leak into a testnet
        deploy.
      </p>

      <h2>Why not just contract + frontend?</h2>

      <p>
        It's tempting to skip the indexing layer and have the frontend read directly from the
        blockchain. For very small scale, that works. For a real product, it breaks down:
      </p>

      <ul>
        <li>Dashboard page load would require scanning every event — slow and expensive</li>
        <li>Hiro API rate limits would hit you quickly as users multiply</li>
        <li>Filtering and sorting would require complex client-side data manipulation</li>
        <li>Off-chain data (webhook URLs, merchant avatars) would have nowhere to live</li>
        <li>Real-time updates would require polling, which is wasteful</li>
      </ul>

      <Callout variant="info" title="This is the standard pattern">
        Uniswap uses The Graph. OpenSea runs its own indexer. Lido, Aave, and virtually every serious
        dApp separates truth (chain) from experience (UI) with an indexing layer. It's the production
        pattern, not over-engineering.
      </Callout>

      <h2>Data flow: a single payment</h2>

      <ol>
        <li>Customer clicks <strong>Pay</strong> in the widget</li>
        <li>Widget builds a contract call and hands it to the wallet extension</li>
        <li>Wallet prompts customer to approve</li>
        <li>Wallet broadcasts the signed transaction to the Stacks network</li>
        <li>Stacks miner includes the TX in a block; contract transfers sBTC, emits <InlineCode>payment-received</InlineCode></li>
        <li>Chainhook picks up the event and POSTs it to the Supabase webhook</li>
        <li>Webhook writes a <InlineCode>payments</InlineCode> row, updates invoice/merchant/platform stats — all in one transaction</li>
        <li>Merchant's dashboard (or customer's receipt view) reads the new row via Supabase and renders the update</li>
      </ol>

      <p>
        End-to-end latency is typically 10–30 seconds on mainnet — bounded by how fast Bitcoin blocks
        confirm the Stacks block containing the TX.
      </p>

      <h2>Upgrade path</h2>

      <p>
        The layer model gives us a clean upgrade path. When the contract evolves (e.g., v6 → v7 with a
        new feature):
      </p>

      <ol>
        <li>Deploy the new contract with a new identifier</li>
        <li>Update the webhook's event handlers to understand any new event fields</li>
        <li>Update the frontend to expose the new features</li>
      </ol>

      <p>
        Existing v6 invoices and subscriptions continue to work — the indexer reads from whichever
        contract produced them. Merchants aren't forced to migrate.
      </p>
    </DocsPage>
  );
}
