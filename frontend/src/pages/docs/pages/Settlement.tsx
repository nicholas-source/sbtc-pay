import { DocsPage } from "../components/DocsPage";
import { InlineCode } from "../components/CodeBlock";
import { Callout } from "../components/Callout";

export default function Settlement() {
  return (
    <DocsPage
      slug="settlement"
      section="Concepts"
      title="Settlement Model"
      description="How funds actually move through sBTC Pay — and why settlement is instant, direct, and custodial-free."
    >
      <p className="lead">
        Every payment on sBTC Pay is a direct wallet-to-wallet transfer that settles in one Stacks
        block — typically 5–10 seconds. sBTC Pay is never in the flow of funds: the contract transfers
        directly between customer and merchant, with a small protocol fee split off in the same atomic
        transaction.
      </p>

      <h2>Who holds what, when</h2>

      <p>At any moment, funds are in exactly one of three places:</p>

      <ul>
        <li><strong>Customer's wallet</strong> — before payment</li>
        <li><strong>In-flight</strong> — during the ~10-second window while the TX is confirming</li>
        <li><strong>Merchant's wallet + protocol fee recipient's wallet</strong> — after confirmation</li>
      </ul>

      <p>
        There is no "sBTC Pay account" holding customer or merchant funds. The contract is a set of
        rules that move money directly between wallets; it never takes custody.
      </p>

      <Callout variant="info" title="Compare to traditional processors">
        Stripe, PayPal, and Square hold merchant money for days before settling to a bank. That delay
        exists because they absorb chargeback risk. On-chain there's no chargeback, so there's no need
        to hold funds. Settlement is immediate.
      </Callout>

      <h2>Atomic fee split</h2>

      <p>Every payment splits the amount into two transfers within a single transaction:</p>

      <ul>
        <li><strong>Merchant receives:</strong> <InlineCode>amount − fee</InlineCode></li>
        <li><strong>Protocol fee:</strong> a small percentage that goes to the fee-recipient address</li>
      </ul>

      <p>
        Both transfers succeed or both revert — the customer never loses funds without the merchant
        receiving them. This atomicity comes for free from Clarity's transaction semantics.
      </p>

      <h2>What "finality" means here</h2>

      <p>
        A Stacks transaction is final once it's included in a Stacks block AND that Stacks block is
        anchored to a Bitcoin block. In practice:
      </p>

      <ul>
        <li><strong>Stacks block:</strong> ~5 seconds after broadcast (post-Nakamoto)</li>
        <li><strong>Bitcoin-anchored finality:</strong> ~10 minutes (one Bitcoin block)</li>
        <li><strong>Deep finality:</strong> 6 Bitcoin blocks (~1 hour)</li>
      </ul>

      <p>
        For most commerce, Stacks-block finality (5 seconds) is enough. For high-value settlement, you
        may want to wait for Bitcoin anchoring. The sBTC Pay dashboard marks a payment as confirmed
        once the Stacks block includes it, and shows the Bitcoin-anchoring depth as it accumulates.
      </p>

      <h2>Refund semantics</h2>

      <p>
        A refund is NOT a reversal — it's a new transfer in the opposite direction, from merchant to
        customer. The original payment remains on-chain. This means:
      </p>

      <ul>
        <li>Merchant must have sufficient balance to issue the refund (contract does not force it)</li>
        <li>The original payment's on-chain record is permanent; the refund is its own separate record</li>
        <li>Partial refunds are natural — each refund is a separate transfer</li>
      </ul>

      <h2>sBTC vs. STX: does it matter?</h2>

      <p>
        The contract supports both tokens. From a settlement perspective they behave the same — both
        transfer atomically on the same block. The difference is economic:
      </p>

      <ul>
        <li>
          <strong>sBTC:</strong> pegged 1:1 to Bitcoin. Most merchants want this — they're effectively
          accepting Bitcoin without running a Lightning node or a Bitcoin-to-fiat off-ramp.
        </li>
        <li>
          <strong>STX:</strong> the native Stacks token. Useful for merchants in the Stacks ecosystem
          (e.g., selling services to other Stacks dApps) where transacting in STX avoids an extra swap.
        </li>
      </ul>

      <h2>Transaction fees (not the same as protocol fees)</h2>

      <p>There are two fees in play on every transaction:</p>

      <ul>
        <li>
          <strong>Protocol fee</strong> — sBTC Pay's cut. Paid in the same token as the payment (sBTC
          or STX). Split atomically from the payment amount.
        </li>
        <li>
          <strong>Transaction fee</strong> — the Stacks network fee paid to miners. Always in STX. Paid
          by whoever broadcasts the transaction (usually the customer for payments, merchant for
          refunds).
        </li>
      </ul>

      <p>
        This means even if you want to accept sBTC-only, your merchant wallet needs a small STX
        balance to pay the network fee when issuing refunds or administrative transactions.
      </p>
    </DocsPage>
  );
}
