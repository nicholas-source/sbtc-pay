import { LegalPage } from "./LegalPage";

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      description="The terms for using sBTC Pay: non-custodial payment software on the Stacks blockchain."
      updated="July 2, 2026"
    >
      <p>
        These terms govern your use of sBTC Pay — the website at sbtc-pay.com, the merchant
        dashboard, the embeddable payment widgets, and the software that connects them to the
        sBTC Pay smart contract on the Stacks blockchain (together, the "Service"). By using the
        Service you agree to these terms. If you do not agree, do not use the Service.
      </p>

      <h2>1. What sBTC Pay is (and is not)</h2>
      <p>
        sBTC Pay is a <strong>non-custodial software interface</strong>. Payments move directly
        from a customer's wallet to a merchant's wallet, executed by an open-source smart
        contract on the Stacks blockchain. We never take possession, custody, or control of your
        funds, and we never have access to your private keys. We are not a bank, a money
        transmitter, an exchange, or a payment processor; we provide software that helps you
        interact with a public blockchain.
      </p>

      <h2>2. Eligibility</h2>
      <p>
        You must be at least 18 years old and legally able to enter into these terms. You may not
        use the Service if doing so is prohibited where you live, or if you are subject to
        sanctions administered by any applicable authority.
      </p>

      <h2>3. Your wallet, your keys</h2>
      <p>
        You access the Service with a self-custodial Stacks wallet. You alone are responsible for
        your wallet, its seed phrase, and its private keys. If you lose them, neither we nor
        anyone else can recover your funds. Transactions you sign are yours.
      </p>

      <h2>4. Payments are final</h2>
      <p>
        Blockchain transactions are irreversible by design. Once a payment confirms on-chain,
        neither the customer, the merchant, nor sBTC Pay can reverse it. There are no
        chargebacks. Merchants can voluntarily issue refunds through the contract's refund
        mechanism, but whether to do so is between the merchant and the customer.
      </p>

      <h2>5. Fees</h2>
      <p>
        The platform charges a fee of 0.5% per transaction, deducted automatically by the smart
        contract at the moment of payment. The current rate is readable by anyone from the
        contract's on-chain state, and promotional rates may apply for limited periods. You also
        pay standard Stacks network fees on every transaction; those go to the network, not to us.
      </p>

      <h2>6. Merchant responsibilities</h2>
      <p>If you accept payments through the Service, you are solely responsible for:</p>
      <ul>
        <li>the goods or services you sell, their legality, quality, and delivery;</li>
        <li>your own customers — support, disputes, and refunds;</li>
        <li>your taxes, reporting, and regulatory obligations in your jurisdiction;</li>
        <li>the security of any webhook endpoints and secrets you configure.</li>
      </ul>
      <p>sBTC Pay is not a party to the transaction between you and your customers.</p>

      <h2>7. Prohibited use</h2>
      <p>
        You may not use the Service for anything unlawful, including selling illegal goods or
        services, fraud, money laundering, financing prohibited activities, or evading sanctions.
        You also may not attack, overload, or attempt to gain unauthorized access to the Service
        or its users.
      </p>

      <h2>8. The smart contract and the interface are different things</h2>
      <p>
        The sBTC Pay smart contract is deployed on a public, permissionless blockchain; anyone
        can interact with it directly without our website. These terms govern our interface — the
        website, dashboard, widgets, indexer, and webhooks. We may suspend or restrict access to
        the interface (for example, for abuse), but doing so does not and cannot freeze funds or
        block the underlying contract.
      </p>

      <h2>9. The Service is provided "as is"</h2>
      <p>
        The software is open source under the MIT license and provided <strong>"as is" and "as
        available," without warranties of any kind</strong>, express or implied, including
        merchantability, fitness for a particular purpose, and non-infringement. We do not
        warrant that the Service will be uninterrupted, error-free, or secure, or that the
        blockchain networks it depends on will behave as expected. Cryptocurrency prices shown in
        the interface are estimates from third-party feeds, not quotes.
      </p>

      <h2>10. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, sBTC Pay and its contributors will not be liable
        for any indirect, incidental, special, consequential, or exemplary damages, or for any
        loss of funds, profits, data, or goodwill, arising from your use of the Service — even if
        advised of the possibility. To the extent liability cannot be excluded, our total
        aggregate liability is limited to the platform fees you paid through the Service in the
        three months before the claim arose.
      </p>

      <h2>11. Indemnification</h2>
      <p>
        You will indemnify and hold harmless sBTC Pay and its contributors from claims arising
        out of your use of the Service, your transactions, the goods or services you sell, or
        your violation of these terms or applicable law.
      </p>

      <h2>12. Changes</h2>
      <p>
        We may update the Service and these terms. Changes to these terms take effect when posted
        on this page with an updated date; your continued use is acceptance. Material changes
        will be noted in the project's release notes.
      </p>

      <h2>13. Governing law</h2>
      <p>
        These terms are governed by the laws of the State of Delaware, United States, without
        regard to its conflict-of-law rules. Disputes will be resolved in the courts located in
        Delaware, and you consent to their jurisdiction.
      </p>

      <h2>14. Contact</h2>
      <p>
        Questions about these terms:{" "}
        <a href="https://github.com/nicholas-source/sbtc-pay/issues" target="_blank" rel="noopener noreferrer">
          github.com/nicholas-source/sbtc-pay/issues
        </a>.
      </p>
    </LegalPage>
  );
}
