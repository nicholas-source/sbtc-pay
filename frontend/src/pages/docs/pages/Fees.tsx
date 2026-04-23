import { Link } from "react-router-dom";
import { DocsPage } from "../components/DocsPage";
import { InlineCode } from "../components/CodeBlock";
import { Callout } from "../components/Callout";
import { PropTable } from "../components/PropTable";

export default function Fees() {
  return (
    <DocsPage
      slug="fees"
      section="For Merchants"
      title="Fees"
      description="The current protocol fee is 0.5%. This page breaks down exactly what it applies to, how it splits, and what else costs money on-chain."
    >
      <p className="lead">
        There are two kinds of fees on every sBTC Pay transaction: a <strong>protocol fee</strong>{" "}
        (sBTC Pay's cut, currently 0.5%) and a <strong>network fee</strong> (paid to Stacks miners to
        include the transaction in a block). They're separate and charged differently.
      </p>

      <h2>Protocol fee: 0.5%</h2>

      <p>
        Every payment that lands on the contract — invoice payment, direct payment, subscription
        payment — splits into two transfers in the same atomic transaction:
      </p>

      <ul>
        <li><strong>Merchant receives:</strong> <InlineCode>amount × 0.995</InlineCode></li>
        <li><strong>Protocol fee recipient:</strong> <InlineCode>amount × 0.005</InlineCode></li>
      </ul>

      <h3>Example</h3>

      <p>A customer pays an invoice for 100,000 sats (0.001 sBTC).</p>

      <ul>
        <li>Merchant's wallet receives <strong>99,500 sats</strong></li>
        <li>Protocol fee recipient receives <strong>500 sats</strong></li>
      </ul>

      <p>
        Both transfers succeed or both revert. The customer sees a single transaction in their wallet,
        and the dashboard's <strong>merchant-received</strong> column shows the post-fee amount.
      </p>

      <Callout variant="info" title="No fee on refunds">
        When a merchant issues a refund, there's no additional protocol fee — the merchant pays the
        refund amount from their own wallet directly to the customer.
      </Callout>

      <h2>Can the fee change?</h2>

      <p>Yes, but with guardrails enforced by the contract itself:</p>

      <PropTable
        rows={[
          { name: "Current fee", type: "uint", defaultValue: "50 bps (0.5%)", description: "The fee applied to every payment today." },
          { name: "Maximum fee ever", type: "uint", defaultValue: "500 bps (5%)", description: "Hard-coded ceiling. The contract rejects any fee change above this." },
          { name: "Max change per update", type: "uint", defaultValue: "100 bps (1%)", description: "One adjustment cannot move the fee by more than this. Prevents surprise jumps." },
          { name: "Who can update", type: "principal", description: "Contract deployer (governance controlled). Changes are public, on-chain, and emit an event." },
        ]}
      />

      <p>
        If the fee ever changes, the update is an on-chain transaction that emits a{" "}
        <InlineCode>platform-fee-updated</InlineCode> event. Anyone can see the current rate by
        calling the <InlineCode>get-fee-rate</InlineCode> read-only function or reading the{" "}
        <InlineCode>platform-fee-bps</InlineCode> data var directly.
      </p>

      <h2>Network (transaction) fee</h2>

      <p>
        Stacks charges a small network fee on every transaction, paid to whichever miner includes it
        in a block. This is separate from the protocol fee and always paid in <strong>STX</strong>,
        regardless of whether the payment itself is sBTC or STX.
      </p>

      <p>Typical amounts at the time of writing:</p>

      <ul>
        <li><strong>Low-congestion mainnet:</strong> 0.001–0.01 STX per transaction</li>
        <li><strong>High congestion:</strong> can spike higher, driven by demand</li>
      </ul>

      <p>Who pays the network fee:</p>

      <ul>
        <li><strong>Customer</strong> — when paying an invoice, making a direct payment, or triggering a subscription payment</li>
        <li><strong>Merchant</strong> — when registering, updating their profile, cancelling an invoice, or issuing a refund</li>
      </ul>

      <Callout variant="warning" title="Your customer needs STX, even to pay in sBTC">
        A customer paying an invoice in sBTC still needs a small STX balance to cover the network fee.
        Most wallets warn the customer if their STX balance is too low. This is a property of Stacks,
        not sBTC Pay — every dApp on Stacks has this requirement.
      </Callout>

      <h2>Side-by-side example</h2>

      <p>A full picture of one invoice payment:</p>

      <ul>
        <li>Invoice amount: <strong>100,000 sats</strong></li>
        <li>Customer pays: <strong>100,000 sats</strong> (+ a few μSTX for network fee)</li>
        <li>Merchant receives: <strong>99,500 sats</strong></li>
        <li>Protocol fee: <strong>500 sats</strong></li>
        <li>Network fee (paid by customer in STX): <strong>~1,000 μSTX</strong></li>
      </ul>

      <p>
        Total cost to the customer: 100,000 sats + ~1,000 μSTX network fee. Everything else is
        value-flow.
      </p>

      <h2>Why 0.5%?</h2>

      <p>
        0.5% sits between traditional card processors (2.5–3.5%) and bank wires (flat fee, long
        settlement). It's low enough that merchants can absorb it without passing it on, but high
        enough to sustain ongoing infrastructure costs. It's a deliberate early-adopter rate — as
        adoption scales, the rate can be adjusted (within the guardrails above).
      </p>

      <h2>Where to check the current rate</h2>

      <p>Three authoritative sources, in order of convenience:</p>

      <ol>
        <li>
          <strong>Frontend constant:</strong>{" "}
          <InlineCode>frontend/src/lib/stacks/config.ts</InlineCode> exports{" "}
          <InlineCode>PLATFORM_FEE_BPS</InlineCode>.
        </li>
        <li>
          <strong>Contract read-only:</strong> call{" "}
          <InlineCode>get-fee-rate</InlineCode> on the deployed contract. See{" "}
          <Link to="/docs/contract">Smart Contract Reference</Link>.
        </li>
        <li>
          <strong>On-chain data var:</strong> read <InlineCode>platform-fee-bps</InlineCode>{" "}
          directly via the Stacks API.
        </li>
      </ol>
    </DocsPage>
  );
}
