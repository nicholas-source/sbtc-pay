import { Link } from "react-router-dom";
import { DocsPage } from "../components/DocsPage";
import { CodeBlock, InlineCode } from "../components/CodeBlock";
import { Callout } from "../components/Callout";
import { Step, Steps } from "../components/Steps";

export default function Quickstart() {
  return (
    <DocsPage
      slug="quickstart"
      section="Get Started"
      title="Quickstart"
      description="From zero to first payment in about 10 minutes. This guide uses testnet so you can practice without spending real Bitcoin."
    >
      <Callout variant="tip" title="What you'll need">
        <ul>
          <li>A Stacks wallet (Leather or Xverse recommended)</li>
          <li>A small amount of testnet STX for transaction fees — free from a faucet</li>
          <li>A small amount of testnet sBTC — also free from a faucet</li>
        </ul>
      </Callout>

      <Steps>
        <Step number={1} title="Install a Stacks wallet">
          <p>
            sBTC Pay works with any standards-compliant Stacks wallet. We recommend{" "}
            <a href="https://leather.io/install-extension" target="_blank" rel="noopener noreferrer">
              Leather
            </a>{" "}
            or{" "}
            <a href="https://www.xverse.app/download" target="_blank" rel="noopener noreferrer">
              Xverse
            </a>
            . Install the browser extension, create a wallet, and save your seed phrase somewhere safe.
          </p>
          <p>
            In the wallet, switch to <strong>Testnet</strong>. This ensures you're using free test
            tokens, not real Bitcoin.
          </p>
        </Step>

        <Step number={2} title="Get testnet tokens from the faucet">
          <p>
            You need two things: STX for transaction fees, and sBTC to send as a payment.
          </p>
          <ul>
            <li>
              <strong>STX faucet:</strong>{" "}
              <a href="https://explorer.hiro.so/sandbox/faucet?chain=testnet" target="_blank" rel="noopener noreferrer">
                explorer.hiro.so/sandbox/faucet
              </a>
            </li>
            <li>
              <strong>sBTC testnet faucet:</strong>{" "}
              <a href="https://platform.hiro.so/faucet" target="_blank" rel="noopener noreferrer">
                platform.hiro.so/faucet
              </a>
            </li>
          </ul>
          <p>
            Paste your testnet address, wait a minute, and refresh your wallet. You should see a
            balance of a few STX and some sBTC.
          </p>
        </Step>

        <Step number={3} title="Register as a merchant">
          <p>
            Open the sBTC Pay dashboard and connect your wallet:
          </p>
          <CodeBlock code="https://sbtc-pay-testnet.vercel.app/dashboard" />
          <p>
            Click <strong>Connect Wallet</strong>, pick your wallet, and approve the connection. On
            first connect, the dashboard will prompt you to <strong>register as a merchant</strong>.
            Give yourself a merchant name and confirm the transaction.
          </p>
          <p>
            The transaction takes about 30 seconds to confirm on testnet. When it's done, you'll land
            on the Dashboard Overview.
          </p>
        </Step>

        <Step number={4} title="Create your first invoice">
          <p>
            From the dashboard, go to <strong>Invoices</strong> → <strong>Create Invoice</strong>.
            Fill in:
          </p>
          <ul>
            <li><strong>Amount:</strong> for testnet, try <InlineCode>1000</InlineCode> sats (0.00001 sBTC)</li>
            <li><strong>Memo:</strong> a short description (e.g., "Test invoice #1")</li>
            <li><strong>Token:</strong> sBTC</li>
          </ul>
          <p>
            Confirm the transaction in your wallet. When it confirms, you'll see the invoice in your
            list with status <strong>Pending</strong>.
          </p>
        </Step>

        <Step number={5} title="Pay the invoice yourself">
          <p>
            Click the invoice to open its public payment page. Copy the URL — it looks like this:
          </p>
          <CodeBlock code="https://sbtc-pay-testnet.vercel.app/pay/1" />
          <p>
            Open that URL in a new tab (or a different browser). Click <strong>Pay with sBTC</strong>,
            approve the transaction in your wallet, and wait for confirmation.
          </p>
          <p>
            Flip back to your dashboard. The invoice status will flip to <strong>Paid</strong>, and
            your revenue counter goes up.
          </p>
        </Step>

        <Step number={6} title="Embed a widget on your site">
          <p>
            From the dashboard, go to <strong>Widget Generator</strong>. Pick <strong>Direct</strong>,
            set an amount, and copy the generated embed code. It looks like this:
          </p>
          <CodeBlock
            language="html"
            code={`<iframe
  src="https://sbtc-pay-testnet.vercel.app/widget/ST123...?amount=10000"
  width="100%"
  height="520"
  frameborder="0"
  style="border-radius:12px;overflow:hidden;max-width:420px;"
  allow="clipboard-write"
></iframe>`}
          />
          <p>
            Paste this into any HTML page. Your customer sees a payment widget, connects their wallet,
            and pays — and the payment lands in your dashboard.
          </p>
        </Step>
      </Steps>

      <Callout variant="success" title="You just shipped a payment integration.">
        <p>
          Everything you did on testnet works the same way on mainnet — with real sBTC. The URLs change
          from <InlineCode>sbtc-pay-testnet.vercel.app</InlineCode> to{" "}
          <InlineCode>sbtc-pay-phi.vercel.app</InlineCode>, and you'll connect a wallet that holds real
          testnet tokens.
        </p>
      </Callout>

      <h2>Next steps</h2>

      <ul>
        <li>
          Learn the full invoice feature set in{" "}
          <Link to="/docs/invoices">Creating Invoices</Link>.
        </li>
        <li>
          Set up recurring billing in{" "}
          <Link to="/docs/subscriptions">Subscriptions</Link>.
        </li>
        <li>
          Explore the three widget variants in{" "}
          <Link to="/docs/widgets">Widget Overview</Link>.
        </li>
        <li>
          Understand what's happening under the hood in{" "}
          <Link to="/docs/architecture">Architecture</Link>.
        </li>
      </ul>
    </DocsPage>
  );
}
