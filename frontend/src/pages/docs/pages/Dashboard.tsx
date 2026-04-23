import { Link } from "react-router-dom";
import { DocsPage } from "../components/DocsPage";
import { InlineCode } from "../components/CodeBlock";
import { Callout } from "../components/Callout";

export default function Dashboard() {
  return (
    <DocsPage
      slug="dashboard"
      section="For Merchants"
      title="Dashboard Guide"
      description="A tour of the merchant dashboard — what every screen shows and how to get what you need fast."
    >
      <p className="lead">
        The dashboard is your home base. Once your wallet is connected, you can see every invoice,
        subscription, refund, and payment you've received — plus configure widgets and manage your
        merchant profile.
      </p>

      <h2>Connecting your wallet</h2>

      <p>
        Click <strong>Connect Wallet</strong> in the top right. Pick your wallet, approve the connection
        — that's it. The dashboard uses your wallet address as your merchant identity. There's no
        password, no email, no separate account.
      </p>

      <Callout variant="warning" title="Keep your seed phrase safe">
        Your wallet is your identity. If you lose your seed phrase, you lose access to your merchant
        account and any funds held in that wallet. sBTC Pay cannot recover it for you.
      </Callout>

      <h2>Overview</h2>

      <p>The dashboard overview shows at-a-glance:</p>

      <ul>
        <li><strong>Total revenue</strong> — lifetime sBTC and STX received</li>
        <li><strong>Active subscribers</strong> — currently billing subscriptions</li>
        <li><strong>Recent payments</strong> — last 10 transactions</li>
        <li><strong>Outstanding invoices</strong> — pending and partial invoices</li>
      </ul>

      <h2>Invoices</h2>

      <p>
        Create, view, cancel, update, and refund invoices. Each row shows the invoice ID, amount,
        status, and creation date. Click a row to see full detail: payment history, customer wallet,
        TX hashes, and available actions.
      </p>

      <p>See <Link to="/docs/invoices">Creating Invoices</Link> for the full lifecycle.</p>

      <h2>Subscriptions</h2>

      <p>
        View all subscriptions created through your widgets. You can see subscriber wallet, plan, next
        payment date, and total paid. Use this view to understand your recurring revenue and identify
        subscribers who are overdue.
      </p>

      <p>See <Link to="/docs/subscriptions">Subscriptions</Link> for how billing works.</p>

      <h2>Refunds</h2>

      <p>
        A ledger of every refund you've issued, with amounts, reasons, and TX hashes. Use this as a
        paper trail when handling disputes or tax reconciliation.
      </p>

      <h2>Widget Generator</h2>

      <p>
        The fastest way to create an embed code. Pick a widget type (Direct / Invoice / Subscription),
        configure it, and copy the generated HTML snippet. See{" "}
        <Link to="/docs/widgets">Widget Overview</Link>.
      </p>

      <h2>Settings</h2>

      <p>Update your merchant profile:</p>

      <ul>
        <li><strong>Display name</strong> — what customers see on payment pages</li>
        <li><strong>Description</strong> — a short blurb about your business</li>
        <li><strong>Logo URL</strong> — shows on your payment pages and customer portal</li>
        <li><strong>Webhook URL</strong> — (optional) we POST payment events here so your system can sync</li>
      </ul>

      <p>
        Changes to these fields are on-chain (your merchant record is part of the contract). Updating
        requires a wallet transaction and a small fee.
      </p>

      <h2>Network switching</h2>

      <p>
        sBTC Pay runs on both testnet and mainnet. Each network has its own dashboard URL:
      </p>

      <ul>
        <li><strong>Mainnet:</strong> <InlineCode>sbtc-pay-phi.vercel.app/dashboard</InlineCode></li>
        <li><strong>Testnet:</strong> <InlineCode>sbtc-pay-testnet.vercel.app/dashboard</InlineCode></li>
      </ul>

      <p>
        Make sure your wallet is set to the same network as the dashboard you're viewing. The dashboard
        will warn you if there's a mismatch.
      </p>

      <h2>Exporting data</h2>

      <p>
        Every table (Invoices, Subscriptions, Refunds) supports CSV export for your own bookkeeping or
        tax reporting. Look for the <strong>Export</strong> button in the top right of each table.
      </p>

      <h2>Keyboard shortcuts</h2>

      <p>The dashboard has a command palette — press <kbd>⌘</kbd>+<kbd>K</kbd> (or <kbd>Ctrl</kbd>+<kbd>K</kbd> on Windows) to open it. From there you can jump to any section or action without touching the mouse.</p>
    </DocsPage>
  );
}
