import { DocsPage } from "../components/DocsPage";
import { PropTable } from "../components/PropTable";
import { Callout } from "../components/Callout";

export default function Errors() {
  return (
    <DocsPage
      slug="errors"
      section="Reference"
      title="Error Codes"
      description="Every error the contract can return, with the likely cause and the fix."
    >
      <p className="lead">
        When a contract call fails, the transaction reverts with a numeric error code like{" "}
        <code>u1001</code>. The frontend maps these to friendly messages, but when you're debugging
        directly you'll want the full catalog.
      </p>

      <Callout variant="info" title="Where you'll see these">
        Error codes appear in wallet rejection dialogs, in transaction failure pages on the Hiro
        Explorer, and in the <code>result</code> field of failed chainhook events.
      </Callout>

      <h2>Authorization errors</h2>

      <PropTable
        nameLabel="Code"
        rows={[
          { name: "u1000", type: "ERR_UNAUTHORIZED", description: "The caller is not allowed to perform this action. Usually means you're trying to act on someone else's invoice/subscription/merchant record." },
          { name: "u1001", type: "ERR_NOT_OWNER", description: "Only the contract deployer can call this function (e.g., updating the fee rate or pausing the contract)." },
          { name: "u1002", type: "ERR_CONTRACT_PAUSED", description: "The contract has been paused for maintenance. Wait for an unpause before retrying." },
        ]}
      />

      <h2>Merchant errors</h2>

      <PropTable
        nameLabel="Code"
        rows={[
          { name: "u2000", type: "ERR_MERCHANT_NOT_FOUND", description: "No merchant is registered for the given principal. Register first with register-merchant." },
          { name: "u2001", type: "ERR_MERCHANT_ALREADY_REGISTERED", description: "This wallet is already registered as a merchant." },
          { name: "u2002", type: "ERR_MERCHANT_INACTIVE", description: "The merchant has been deactivated and cannot accept new payments." },
          { name: "u2003", type: "ERR_MERCHANT_SUSPENDED", description: "The merchant has been administratively suspended." },
        ]}
      />

      <h2>Invoice errors</h2>

      <PropTable
        nameLabel="Code"
        rows={[
          { name: "u3000", type: "ERR_INVOICE_NOT_FOUND", description: "No invoice with this ID exists." },
          { name: "u3001", type: "ERR_INVOICE_EXPIRED", description: "The invoice's expires-at block has passed. Create a new invoice." },
          { name: "u3002", type: "ERR_INVOICE_CANCELLED", description: "The merchant cancelled this invoice." },
          { name: "u3003", type: "ERR_INVOICE_ALREADY_PAID", description: "Invoice is fully paid. For partial invoices, this means total received = amount." },
          { name: "u3004", type: "ERR_AMOUNT_TOO_LOW", description: "Payment amount is less than the minimum, or you're trying to pay less than full on an invoice that doesn't allow partial payments." },
          { name: "u3005", type: "ERR_AMOUNT_TOO_HIGH", description: "Payment amount exceeds the invoice amount and allow-overpay is false." },
          { name: "u3006", type: "ERR_INVOICE_NOT_PAYABLE", description: "Invoice is in a status (cancelled, expired, refunded) that doesn't accept payments." },
          { name: "u3007", type: "ERR_INVOICE_LOCKED", description: "Invoice has received at least one payment and can no longer be updated — only refunded." },
        ]}
      />

      <h2>Subscription errors</h2>

      <PropTable
        nameLabel="Code"
        rows={[
          { name: "u4000", type: "ERR_SUBSCRIPTION_NOT_FOUND", description: "No subscription with this ID exists." },
          { name: "u4001", type: "ERR_SUBSCRIPTION_CANCELLED", description: "Subscription is cancelled. Create a new one to resubscribe." },
          { name: "u4002", type: "ERR_NOT_DUE_YET", description: "Payment is attempted before next-payment-at. Wait for the interval to elapse." },
          { name: "u4003", type: "ERR_SUBSCRIPTION_PAUSED", description: "Subscription is paused. Resume it before paying." },
          { name: "u4004", type: "ERR_ALREADY_PAUSED", description: "You tried to pause a subscription that's already paused." },
          { name: "u4005", type: "ERR_NOT_PAUSED", description: "You tried to resume a subscription that isn't paused." },
        ]}
      />

      <h2>Refund errors</h2>

      <PropTable
        nameLabel="Code"
        rows={[
          { name: "u5000", type: "ERR_REFUND_WINDOW_EXPIRED", description: "The invoice is too old to refund. Refund window is measured from first-payment-at." },
          { name: "u5001", type: "ERR_REFUND_EXCEEDS_PAID", description: "You tried to refund more than the total amount paid on this invoice." },
          { name: "u5002", type: "ERR_INVOICE_NOT_PAID", description: "You can only refund invoices that have received at least one payment." },
          { name: "u5003", type: "ERR_INVALID_REFUND_AMOUNT", description: "Refund amount must be greater than zero." },
        ]}
      />

      <h2>Token / transfer errors</h2>

      <PropTable
        nameLabel="Code"
        rows={[
          { name: "u6000", type: "ERR_INVALID_TOKEN_TYPE", description: "Unknown token type. Must be u0 (sBTC) or u1 (STX)." },
          { name: "u6001", type: "ERR_TRANSFER_FAILED", description: "The underlying token transfer failed — usually means sender has insufficient balance." },
          { name: "u6002", type: "ERR_INSUFFICIENT_BALANCE", description: "Sender wallet doesn't have enough of the token to cover the payment or refund." },
        ]}
      />

      <h2>What to show users</h2>

      <p>
        The frontend's <code>CONTRACT_ERRORS</code> map translates these codes into human-friendly
        messages. When you integrate, check that map first — if you see an error like <code>u5000</code>{" "}
        in production, you can match it to the appropriate user message ("This invoice is too old to
        refund") rather than showing the raw code.
      </p>
    </DocsPage>
  );
}
