import { DocsPage } from "../components/DocsPage";
import { InlineCode } from "../components/CodeBlock";
import { Callout } from "../components/Callout";

export default function Timing() {
  return (
    <DocsPage
      slug="timing"
      section="Concepts"
      title="Burn-Block Timing"
      description="Why sBTC Pay measures all time-based logic in Bitcoin burn blocks, not Stacks blocks — and why this matters after the Nakamoto upgrade."
    >
      <p className="lead">
        Every time-sensitive piece of the contract — invoice expiry, refund window, subscription
        interval — is counted in <strong>burn blocks</strong> (Bitcoin blocks), not Stacks blocks. This
        page explains why, and why it matters specifically after the Stacks Nakamoto upgrade.
      </p>

      <h2>Two clocks, very different speeds</h2>

      <p>Stacks has two block heights you can reference from a Clarity contract:</p>

      <ul>
        <li>
          <strong><InlineCode>stacks-block-height</InlineCode></strong> — increments every Stacks block.
          Post-Nakamoto: roughly every 5 seconds.
        </li>
        <li>
          <strong><InlineCode>burn-block-height</InlineCode></strong> — increments every Bitcoin block.
          Roughly every 10 minutes on mainnet, 5 minutes on testnet.
        </li>
      </ul>

      <p>
        Before Nakamoto, these were tightly coupled (one Stacks block per Bitcoin block). After
        Nakamoto, Stacks blocks are fast — ~120× faster than Bitcoin blocks. That speed is great for
        dApp UX, but it's a trap for anything that measures calendar time.
      </p>

      <h2>The trap</h2>

      <p>Imagine a subscription with a "monthly" billing interval. You might naively write:</p>

      <p>
        <strong>"A month is 30 × 24 × 60 / 5 = 8,640 Stacks blocks"</strong> (at 5 seconds per block)
      </p>

      <p>
        Then you use <InlineCode>stacks-block-height</InlineCode> in your contract. Looks fine. Ships
        to mainnet. Works for a few months. Then, during a period of congestion or slow block
        production, the Stacks block time temporarily drops to, say, 3 seconds — and suddenly your
        "monthly" subscription bills every 18 days. Or, in an idle period when Stacks blocks slow to 8
        seconds, it bills every 48 days.
      </p>

      <p>
        Stacks block time is <strong>variable</strong>. Calendar time is not. Measuring calendar time in
        Stacks blocks is always wrong, and after Nakamoto the error is large.
      </p>

      <h2>The fix: count in Bitcoin blocks</h2>

      <p>
        Bitcoin's block time is tightly regulated by its difficulty adjustment. Over any meaningful
        window, Bitcoin blocks land at ~10-minute intervals. That makes{" "}
        <InlineCode>burn-block-height</InlineCode> a reliable clock for calendar-time logic.
      </p>

      <p>So the contract defines:</p>

      <ul>
        <li><strong>Daily:</strong> 144 burn blocks (24 × 60 / 10)</li>
        <li><strong>Weekly:</strong> 1,008 burn blocks</li>
        <li><strong>Monthly:</strong> 4,320 burn blocks (30 days)</li>
      </ul>

      <p>
        These are approximate — Bitcoin blocks aren't exactly 10 minutes — but the error is small and
        bounded. Over a year, block-time drift is typically under 1–2%.
      </p>

      <Callout variant="info" title="Testnet is faster">
        Stacks testnet anchors to Bitcoin testnet, which targets 5-minute blocks. So on testnet,
        "daily" is 288 burn blocks, not 144. The frontend and contract read the network at runtime and
        use the right constant. If you're building a widget that embeds an interval, let sBTC Pay
        handle the conversion — don't hard-code block counts in your URL unless you know what you're
        doing.
      </Callout>

      <h2>Where burn blocks are used</h2>

      <p>Every time reference in the sBTC Pay contract uses burn blocks:</p>

      <ul>
        <li><strong>Invoice creation:</strong> <InlineCode>created-at</InlineCode> = current burn block</li>
        <li><strong>Invoice expiry:</strong> <InlineCode>expires-at</InlineCode> = created-at + expires-in-blocks</li>
        <li><strong>Subscription creation:</strong> next-payment-at = current burn block (due immediately)</li>
        <li><strong>Subscription interval:</strong> next-payment-at = last-payment-at + interval-blocks</li>
        <li><strong>Refund window:</strong> refund-deadline = first-payment-at + refund-window-blocks</li>
      </ul>

      <h2>What this means for integrators</h2>

      <p>
        If you ever need to compute "when will this be due?" in your own code, use the same approach:
      </p>

      <ol>
        <li>Read the relevant block height field (in burn blocks)</li>
        <li>Convert to wall-clock time using the network's average burn-block time (~600 sec mainnet, ~300 sec testnet)</li>
      </ol>

      <p>The frontend already does this for you — dashboard and customer portal dates are derived exactly this way.</p>

      <Callout variant="warning" title="Don't convert with stacks-block-height">
        If you see code that converts time by multiplying stacks-block-height by 5 seconds, it's wrong.
        It will drift whenever network conditions change. Always use burn-block-height for calendar-time
        math.
      </Callout>
    </DocsPage>
  );
}
