import { Link } from "react-router-dom";
import { DocsPage } from "../components/DocsPage";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const FAQ_ITEMS = [
  {
    q: "Is sBTC Pay custodial?",
    a: (
      <p>
        No. Funds move directly from customer wallet to merchant wallet in a single atomic contract
        call. sBTC Pay never holds your money, and there's no account you can be locked out of.
      </p>
    ),
  },
  {
    q: "What are the fees?",
    a: (
      <>
        <p>
          sBTC Pay takes a small protocol fee on every payment. The exact rate is on the landing page's
          pricing section and is stored on-chain in the contract's fee-rate storage. The merchant sees
          the net amount as <code>merchant-received</code> in the dashboard.
        </p>
        <p>
          Network fees (paid to Stacks miners, always in STX) are separate and paid by whoever
          broadcasts the transaction — usually the customer for payments, and the merchant for
          administrative actions like refunds.
        </p>
      </>
    ),
  },
  {
    q: "Can I accept fiat?",
    a: (
      <p>
        Not directly. sBTC Pay is Bitcoin in, Bitcoin out. If you want fiat payouts, you'll need to
        swap sBTC to fiat via a separate service like a crypto exchange or off-ramp. For merchants
        needing direct card acceptance, a traditional processor is the right tool.
      </p>
    ),
  },
  {
    q: "Does my customer need STX to pay?",
    a: (
      <p>
        Yes, a small amount. Customers pay Stacks network fees in STX when broadcasting a transaction,
        even if the payment itself is in sBTC. Most wallets warn users if their STX balance is too low
        to cover fees.
      </p>
    ),
  },
  {
    q: "How fast does a payment confirm?",
    a: (
      <p>
        Post-Nakamoto, a Stacks block confirms in about 5 seconds. The dashboard marks payments as
        confirmed once they're included in a Stacks block. For high-value payments, you may want to
        wait for Bitcoin anchoring (~10 minutes) before releasing goods.
      </p>
    ),
  },
  {
    q: "What happens during a Bitcoin reorg?",
    a: (
      <p>
        The indexing layer subscribes to Chainhook's rollback events. When a Bitcoin reorg occurs, the
        corresponding Stacks blocks are rolled back and the indexer deletes affected rows and
        recomputes aggregates. See <Link to="/docs/architecture">Architecture</Link> for details.
        Reorgs deeper than one block are extremely rare on Bitcoin mainnet.
      </p>
    ),
  },
  {
    q: "Can I self-host sBTC Pay?",
    a: (
      <>
        <p>
          Partially. The frontend is open source — you can clone it and deploy to your own domain. You
          can point it at your own Supabase instance as the indexing layer.
        </p>
        <p>
          The Clarity contract is deployed on Stacks mainnet and is a shared protocol — you don't host
          a separate copy for your own merchants; you register as a merchant on the existing deployment.
        </p>
      </>
    ),
  },
  {
    q: "Has the contract been audited?",
    a: (
      <p>
        Formal third-party audit is on the roadmap ahead of sustained adoption. Internal security
        review has progressed through six contract versions (v1 → v6), with each iteration focused on
        edge cases and safety rather than features. When a formal audit is completed, a signed report
        will be published here.
      </p>
    ),
  },
  {
    q: "What if the indexer goes down?",
    a: (
      <p>
        The contract is the source of truth. If the indexer is down, the frontend can't show new
        payments immediately, but the payments themselves still settle on-chain. When the indexer comes
        back online, Chainhook replays missed events and the dashboard catches up. No payments are
        lost.
      </p>
    ),
  },
  {
    q: "Can I migrate from Stripe / PayPal?",
    a: (
      <p>
        The integration path is similar — embed a widget on your checkout page. The big differences:
        customers need a Stacks wallet (vs. a card), you receive sBTC (vs. fiat), and there are no
        chargebacks. Most merchants run both for a while: traditional processor for card customers,
        sBTC Pay for crypto-native customers.
      </p>
    ),
  },
  {
    q: "Is there an API?",
    a: (
      <p>
        Direct merchant API (REST) is on the roadmap. Today, you can read indexed data via Supabase's
        client SDK using your merchant's public data, and you can write by signing contract
        transactions from your own wallet with <code>@stacks/transactions</code>.
      </p>
    ),
  },
  {
    q: "What jurisdictions does sBTC Pay work in?",
    a: (
      <p>
        sBTC Pay is a non-custodial protocol — there's no onboarding check or regional gating. However,
        merchants are responsible for their own jurisdiction's rules around accepting Bitcoin payments,
        including tax reporting and (in some jurisdictions) money transmission licensing. Consult a
        lawyer familiar with crypto in your region.
      </p>
    ),
  },
];

export default function Faq() {
  return (
    <DocsPage
      slug="faq"
      section="Reference"
      title="FAQ"
      description="Frequently asked questions. Can't find your answer? Open an issue on the repo."
    >
      <Accordion type="multiple" className="not-prose">
        {FAQ_ITEMS.map((item, i) => (
          <AccordionItem key={i} value={`item-${i}`} className="border-border">
            <AccordionTrigger className="text-left hover:no-underline">
              {item.q}
            </AccordionTrigger>
            <AccordionContent className="text-body text-foreground/85 [&>p]:my-2 [&>p:first-child]:mt-0">
              {item.a}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </DocsPage>
  );
}
