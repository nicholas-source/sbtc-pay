import { LegalPage } from "./LegalPage";

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      description="What data sBTC Pay collects, what lives on-chain forever, and what we can delete on request."
      updated="July 2, 2026"
    >
      <p>
        sBTC Pay is non-custodial payment software on the Stacks blockchain. We designed it to
        need as little of your data as possible: there are no accounts, no passwords, no email
        sign-up, and no identity verification. This policy explains what little we do handle,
        where it lives, and what we can and cannot delete.
      </p>

      <h2>The short version</h2>
      <ul>
        <li>Your wallet address is your login. We never see your private keys or seed phrase.</li>
        <li>We run no advertising trackers and no third-party analytics.</li>
        <li>Payments happen on a public blockchain. That data is visible to everyone and permanent; nobody, including us, can delete it.</li>
        <li>We keep an off-chain copy of on-chain activity to make the dashboard fast. That copy we can delete on request.</li>
      </ul>

      <h2>Data we handle</h2>
      <p>
        <strong>Wallet addresses.</strong> When you connect a wallet, we receive your public
        Stacks address. Addresses are public information on the blockchain; we use yours to show
        your invoices, payments, and balances, and to authenticate dashboard requests.
      </p>
      <p>
        <strong>Merchant profile data.</strong> If you register as a merchant, the name,
        description, and logo URL you choose are recorded on-chain (public and permanent) and
        cached in our database. A webhook URL and webhook secret, if you configure them, are
        stored off-chain only.
      </p>
      <p>
        <strong>Payment activity.</strong> Invoices, payments, subscriptions, and refunds are
        events on the Stacks blockchain. Our indexer mirrors them into a database so the
        dashboard can query them quickly. The mirror contains nothing that is not already public
        on-chain, except delivery logs for your webhooks.
      </p>
      <p>
        <strong>Browser storage.</strong> We use your browser's localStorage for your wallet
        session, a short-lived authentication token (24 hours), and interface preferences. We do
        not use tracking cookies.
      </p>
      <p>
        <strong>Technical logs.</strong> Our infrastructure providers keep standard server logs
        (IP addresses, request timestamps) for security and reliability. We do not build profiles
        from them.
      </p>

      <h2>Services we rely on</h2>
      <ul>
        <li><strong>Vercel</strong> hosts the website.</li>
        <li><strong>Supabase</strong> hosts the database and the functions behind webhooks and authentication.</li>
        <li><strong>Hiro APIs</strong> provide blockchain data (your browser queries them directly).</li>
        <li><strong>Coinbase and CoinGecko</strong> provide BTC and STX price quotes (your browser queries them directly; we send them nothing about you).</li>
        <li><strong>Your wallet</strong> (Leather, Xverse, or a WalletConnect-compatible wallet) handles keys and signing under its own privacy policy.</li>
      </ul>

      <h2>What we do with data</h2>
      <p>
        We use the data above to operate the product: showing your dashboard, generating payment
        links, delivering webhooks to endpoints you configured, and keeping the service secure.
        We do not sell data, share it with advertisers, or use it for marketing.
      </p>

      <h2>On-chain data is permanent</h2>
      <p>
        This is the most important thing on this page. Every payment, invoice, registration, and
        refund is a transaction on the public Stacks blockchain, linked to the participating
        wallet addresses, replicated across the network, and permanent by design. If you need a
        payment to be private or erasable, a public blockchain is the wrong tool, and no privacy
        policy can change that.
      </p>

      <h2>Deletion and your rights</h2>
      <p>
        You can ask us to delete anything we control: the off-chain cache of your activity, your
        webhook configuration, and delivery logs. Open an issue at{" "}
        <a href="https://github.com/nicholas-source/sbtc-pay/issues" target="_blank" rel="noopener noreferrer">
          github.com/nicholas-source/sbtc-pay/issues
        </a>{" "}
        from context that demonstrates control of the wallet in question. Note that our indexer
        mirrors public chain data, so records of on-chain events may be re-created by re-indexing;
        what we can permanently remove is the off-chain-only data (webhook URLs, secrets, and logs).
        You can also disconnect your wallet at any time and clear the site's localStorage from
        your browser.
      </p>

      <h2>Children</h2>
      <p>sBTC Pay is not directed at anyone under 18, and we do not knowingly collect data from them.</p>

      <h2>Changes</h2>
      <p>
        If this policy changes, we will update this page and the date at the top. Material changes
        will be noted in the project's release notes.
      </p>

      <h2>Contact</h2>
      <p>
        Privacy questions and requests:{" "}
        <a href="https://github.com/nicholas-source/sbtc-pay/issues" target="_blank" rel="noopener noreferrer">
          github.com/nicholas-source/sbtc-pay/issues
        </a>.
      </p>
    </LegalPage>
  );
}
