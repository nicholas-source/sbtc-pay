
import { Cl, ClarityType } from "@stacks/transactions";
import { describe, expect, it, beforeEach } from "vitest";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const merchant1 = accounts.get("wallet_1")!;
const merchant2 = accounts.get("wallet_2")!;
const payer1 = accounts.get("wallet_3")!;
const payer2 = accounts.get("wallet_4")!;

// Matches the [contracts.sbtc-pay] entry in Clarinet.toml (path is
// contracts/sbtc-pay-mainnet.clar). The historical "payment-v5" name was
// renamed to the brand-aligned "sbtc-pay" during M1; tests now point at the
// canonical name.
const CONTRACT_NAME = "sbtc-pay";

// Helper: register a merchant with full v4 args
function registerMerchant(sender: string, name = "Test Merchant") {
  return simnet.callPublicFn(
    CONTRACT_NAME,
    "register-merchant",
    [
      Cl.stringUtf8(name),
      Cl.none(), // description
      Cl.none(), // webhook-url
      Cl.none(), // logo-url
    ],
    sender,
  );
}

// Token-type constants — must match the on-chain values in sbtc-pay.clar.
// TOKEN_STX is retained for parity / future STX-path tests even though current
// suite defaults to sBTC; suppress the unused-warning explicitly.
const TOKEN_SBTC = 0;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const TOKEN_STX = 1;

// Helper: create a simple invoice via the advanced create-invoice.
// The contract gained a `token-type` parameter when STX support landed
// (migration 002). Tests default to sBTC for backward compatibility.
function createInvoice(
  sender: string,
  amount: number,
  memo = "Test invoice",
  expiresInBlocks = 1000,
  allowPartial = false,
  allowOverpay = false,
  tokenType: number = TOKEN_SBTC,
) {
  return simnet.callPublicFn(
    CONTRACT_NAME,
    "create-invoice",
    [
      Cl.uint(amount),
      Cl.stringUtf8(memo),
      Cl.none(), // reference-id
      Cl.uint(expiresInBlocks),
      Cl.bool(allowPartial),
      Cl.bool(allowOverpay),
      Cl.uint(tokenType),
    ],
    sender,
  );
}

describe("sBTC Pay v4 — Contract Tests", () => {

  // =============================================
  // MERCHANT REGISTRATION
  // =============================================

  describe("Merchant Registration", () => {

    it("allows a new merchant to register", () => {
      const result = registerMerchant(merchant1, "Coffee Shop");
      expect(result.result).toHaveClarityType(ClarityType.ResponseOk);
      expect(result.result).toBeOk(Cl.uint(1));
      expect(result.events[0].event).toBe("print_event");
    });

    it("prevents duplicate merchant registration", () => {
      registerMerchant(merchant1, "Shop 1");
      const result = registerMerchant(merchant1, "Shop 2");
      expect(result.result).toBeErr(Cl.uint(2002)); // ERR_MERCHANT_EXISTS
    });

    it("allows merchant to update profile", () => {
      registerMerchant(merchant1, "Old Name");
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "update-merchant-profile",
        [
          Cl.stringUtf8("New Name"),
          Cl.some(Cl.stringUtf8("A great shop")),
          Cl.some(Cl.stringUtf8("https://webhook.example.com")),
          Cl.some(Cl.stringUtf8("https://logo.example.com/img.png")),
        ],
        merchant1,
      );
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it("allows merchant to deactivate account", () => {
      registerMerchant(merchant1);
      const result = simnet.callPublicFn(CONTRACT_NAME, "deactivate-merchant", [], merchant1);
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it("allows merchant to reactivate after deactivation", () => {
      registerMerchant(merchant1);
      simnet.callPublicFn(CONTRACT_NAME, "deactivate-merchant", [], merchant1);
      const result = simnet.callPublicFn(CONTRACT_NAME, "reactivate-merchant", [], merchant1);
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it("prevents non-merchant from updating profile", () => {
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "update-merchant-profile",
        [Cl.stringUtf8("Name"), Cl.none(), Cl.none(), Cl.none()],
        payer1,
      );
      expect(result.result).toBeErr(Cl.uint(2001)); // ERR_MERCHANT_NOT_FOUND
    });
  });

  // =============================================
  // INVOICE MANAGEMENT
  // =============================================

  describe("Invoice Management", () => {

    beforeEach(() => {
      registerMerchant(merchant1);
    });

    it("allows merchant to create an invoice (advanced)", () => {
      const result = createInvoice(merchant1, 100000, "Payment for coffee");
      expect(result.result).toHaveClarityType(ClarityType.ResponseOk);
      expect(result.result).toBeOk(Cl.uint(1));
    });

    it("allows merchant to create a simple invoice", () => {
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "create-simple-invoice",
        [Cl.uint(50000), Cl.stringUtf8("Simple invoice"), Cl.uint(144)],
        merchant1,
      );
      expect(result.result).toBeOk(Cl.uint(1));
    });

    it("prevents non-merchant from creating invoice", () => {
      const result = createInvoice(payer1, 100000);
      expect(result.result).toBeErr(Cl.uint(2001)); // ERR_MERCHANT_NOT_FOUND
    });

    it("prevents creating invoice below minimum amount", () => {
      const result = createInvoice(merchant1, 999); // below MIN_INVOICE_AMOUNT (1000)
      expect(result.result).toBeErr(Cl.uint(3007)); // ERR_AMOUNT_TOO_LOW
    });

    it("allows merchant to update pending invoice", () => {
      createInvoice(merchant1, 50000, "Original memo");
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "update-invoice",
        [Cl.uint(1), Cl.uint(75000), Cl.stringUtf8("Updated memo"), Cl.uint(288)],
        merchant1,
      );
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it("prevents non-merchant from updating invoice", () => {
      createInvoice(merchant1, 50000);
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "update-invoice",
        [Cl.uint(1), Cl.uint(75000), Cl.stringUtf8("Hacked"), Cl.uint(288)],
        payer1,
      );
      expect(result.result).toBeErr(Cl.uint(1001)); // ERR_NOT_AUTHORIZED
    });

    it("allows merchant to cancel pending invoice", () => {
      createInvoice(merchant1, 50000);
      const result = simnet.callPublicFn(CONTRACT_NAME, "cancel-invoice", [Cl.uint(1)], merchant1);
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it("prevents non-merchant from cancelling invoice", () => {
      createInvoice(merchant1, 50000);
      const result = simnet.callPublicFn(CONTRACT_NAME, "cancel-invoice", [Cl.uint(1)], payer1);
      expect(result.result).toBeErr(Cl.uint(1001)); // ERR_NOT_AUTHORIZED
    });

    it("creates invoice with partial payments enabled", () => {
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "create-invoice",
        [
          Cl.uint(100000),
          Cl.stringUtf8("Partial OK"),
          Cl.some(Cl.stringUtf8("REF-001")),
          Cl.uint(500),
          Cl.bool(true),  // allow-partial
          Cl.bool(false),
          Cl.uint(TOKEN_SBTC),
        ],
        merchant1,
      );
      expect(result.result).toBeOk(Cl.uint(1));
    });
  });

  // =============================================
  // PAYMENT TESTS
  // =============================================

  describe("Payments", () => {

    beforeEach(() => {
      registerMerchant(merchant1);
      createInvoice(merchant1, 100000, "Test payment", 1000);
    });

    // sBTC happy-path tests are exercised via the STX path below — the contract's
    // pay-invoice (sBTC) and pay-invoice-stx (STX) share the same authorization
    // checks, accounting, status transitions, and event shape; only the actual
    // token transfer differs (ft-transfer? vs stx-transfer?). Simnet accounts
    // hold STX by default, so the STX flow exercises every line of the shared
    // payment codepath end-to-end without needing a mock SIP-010 deployment.
    // The sBTC-only error-path tests further below (cancelled, overpayment,
    // underpayment) verify the input-validation branches that fire before any
    // token transfer is attempted.

    it("allows payer to pay an invoice (STX flow)", () => {
      // Override the beforeEach invoice with a STX one
      createInvoice(merchant1, 100000, "STX invoice", 1000, false, false, TOKEN_STX);
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "pay-invoice-stx",
        [Cl.uint(2), Cl.uint(100000)],
        payer1,
      );
      expect(result.result).toHaveClarityType(ClarityType.ResponseOk);
    });

    it("allows pay-invoice-exact shortcut (STX flow)", () => {
      createInvoice(merchant1, 100000, "STX invoice", 1000, false, false, TOKEN_STX);
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "pay-invoice-exact-stx",
        [Cl.uint(2)],
        payer1,
      );
      expect(result.result).toHaveClarityType(ClarityType.ResponseOk);
    });

    it("prevents paying same invoice twice", () => {
      simnet.callPublicFn(CONTRACT_NAME, "pay-invoice", [Cl.uint(1), Cl.uint(100000)], payer1);
      const result = simnet.callPublicFn(CONTRACT_NAME, "pay-invoice", [Cl.uint(1), Cl.uint(100000)], payer2);
      expect(result.result).toHaveClarityType(ClarityType.ResponseErr);
    });

    it("prevents paying cancelled invoice", () => {
      simnet.callPublicFn(CONTRACT_NAME, "cancel-invoice", [Cl.uint(1)], merchant1);
      const result = simnet.callPublicFn(CONTRACT_NAME, "pay-invoice", [Cl.uint(1), Cl.uint(100000)], payer1);
      expect(result.result).toHaveClarityType(ClarityType.ResponseErr);
    });

    it("prevents overpayment when not allowed", () => {
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "pay-invoice",
        [Cl.uint(1), Cl.uint(200000)], // 2x the amount
        payer1,
      );
      expect(result.result).toBeErr(Cl.uint(4003)); // ERR_OVERPAYMENT
    });

    it("prevents underpayment when partial not allowed", () => {
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "pay-invoice",
        [Cl.uint(1), Cl.uint(50000)], // half the amount
        payer1,
      );
      expect(result.result).toBeErr(Cl.uint(4002)); // ERR_INSUFFICIENT_PAYMENT
    });

    it("allows direct payment to merchant (STX flow)", () => {
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "pay-merchant-direct-stx",
        [Cl.principal(merchant1), Cl.uint(50000), Cl.stringUtf8("Thanks!")],
        payer1,
      );
      expect(result.result).toHaveClarityType(ClarityType.ResponseOk);
    });

    it("prevents direct payment to non-merchant", () => {
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "pay-merchant-direct",
        [Cl.principal(payer2), Cl.uint(50000), Cl.stringUtf8("Test")],
        payer1,
      );
      expect(result.result).toBeErr(Cl.uint(2001)); // ERR_MERCHANT_NOT_FOUND
    });

    it("prevents direct payment below minimum", () => {
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "pay-merchant-direct",
        [Cl.principal(merchant1), Cl.uint(500), Cl.stringUtf8("Too small")],
        payer1,
      );
      expect(result.result).toBeErr(Cl.uint(3007)); // ERR_AMOUNT_TOO_LOW
    });
  });

  // =============================================
  // REFUND TESTS
  // =============================================

  describe("Refunds", () => {

    // Refunds are tested via the contract's STX path (refund-invoice-stx +
    // refund-invoice-full-stx). The sBTC variant (refund-invoice) shares
    // identical logic: same authorization check (caller == merchant), same
    // refund-window enforcement, same accounting (amount-refunded delta,
    // total-refunded-{token} merchant aggregate, refunds map insert,
    // refund-counter bump), and same event shape — the only line that differs
    // between the two paths is the transfer call (ft-transfer? sbtc-token vs
    // stx-transfer?). Testing the STX flow end-to-end exercises every branch
    // of the shared refund codepath, including the error paths.
    //
    // We chose this over a mock SIP-010 deployment because:
    //   • Simnet accounts hold STX by default — no mock minting needed.
    //   • The deployed mainnet contract's sBTC reference is hardcoded to
    //     SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token, so a mock
    //     would need a divergent test-only contract copy. The STX path
    //     tests the production contract as-deployed.

    beforeEach(() => {
      registerMerchant(merchant1);
      // Create + pay a STX invoice so each refund test has something to refund
      createInvoice(merchant1, 100000, "Refund test", 1000, false, false, TOKEN_STX);
      const payResult = simnet.callPublicFn(
        CONTRACT_NAME,
        "pay-invoice-stx",
        [Cl.uint(1), Cl.uint(100000)],
        payer1,
      );
      // Sanity-check the setup — if payment fails, refund tests are meaningless
      expect(payResult.result).toHaveClarityType(ClarityType.ResponseOk);
    });

    it("allows merchant to process partial refund", () => {
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "refund-invoice-stx",
        [
          Cl.uint(1),
          Cl.uint(50000), // half of the 100000 paid
          Cl.stringUtf8("Partial refund — customer dissatisfied"),
        ],
        merchant1,
      );
      expect(result.result).toHaveClarityType(ClarityType.ResponseOk);

      // After partial refund, the invoice should still show 50000 refundable
      const refundable = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-refundable-amount",
        [Cl.uint(1)],
        deployer,
      );
      expect(refundable.result).toBeUint(50000);
    });

    it("allows merchant to process full refund", () => {
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "refund-invoice-full-stx",
        [Cl.uint(1), Cl.stringUtf8("Full refund — order cancelled")],
        merchant1,
      );
      expect(result.result).toHaveClarityType(ClarityType.ResponseOk);

      // After full refund, refundable should be 0 and invoice status should be refunded
      const refundable = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-refundable-amount",
        [Cl.uint(1)],
        deployer,
      );
      expect(refundable.result).toBeUint(0);
    });

    it("prevents non-merchant from refunding", () => {
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "refund-invoice-stx",
        [Cl.uint(1), Cl.uint(50000), Cl.stringUtf8("Hacked")],
        payer1, // not the merchant
      );
      expect(result.result).toBeErr(Cl.uint(1001)); // ERR_NOT_AUTHORIZED
    });

    it("prevents refunding more than paid", () => {
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "refund-invoice-stx",
        [
          Cl.uint(1),
          Cl.uint(200000), // 2x the paid amount
          Cl.stringUtf8("Over-refund attempt"),
        ],
        merchant1,
      );
      expect(result.result).toBeErr(Cl.uint(4004)); // ERR_REFUND_EXCEEDS_PAID
    });

    it("prevents zero amount refund", () => {
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "refund-invoice-stx",
        [Cl.uint(1), Cl.uint(0), Cl.stringUtf8("Zero refund")],
        merchant1,
      );
      expect(result.result).toBeErr(Cl.uint(3006)); // ERR_INVALID_AMOUNT
    });
  });

  // =============================================
  // sBTC PAYMENT + REFUND TESTS (via mock SIP-010)
  // =============================================
  // These tests exercise the actual sBTC code paths — pay-invoice (ft-transfer?),
  // pay-merchant-direct, refund-invoice — against a test-only contract variant
  // (sbtc-pay-test.clar) that substitutes the mainnet sBTC token reference
  // with a local mock SIP-010 (mock-sbtc-token.clar). Every other line of the
  // contract is byte-for-byte identical to sbtc-pay-mainnet.clar; only the
  // sBTC principal differs at six call sites. This pattern is the standard
  // approach for testing Stacks contracts that call mainnet token contracts
  // for which simnet has no balance source.

  const TEST_CONTRACT = "sbtc-pay-test";
  const MOCK_TOKEN = "mock-sbtc-token";

  function mintMockSbtc(recipient: string, amount: number) {
    return simnet.callPublicFn(
      MOCK_TOKEN,
      "mint",
      [Cl.uint(amount), Cl.principal(recipient)],
      deployer,
    );
  }

  function registerMerchantTest(sender: string, name = "Test Merchant") {
    return simnet.callPublicFn(
      TEST_CONTRACT,
      "register-merchant",
      [Cl.stringUtf8(name), Cl.none(), Cl.none(), Cl.none()],
      sender,
    );
  }

  function createInvoiceTest(
    sender: string,
    amount: number,
    memo = "Test invoice",
    expiresInBlocks = 1000,
    allowPartial = false,
    allowOverpay = false,
    tokenType: number = TOKEN_SBTC,
  ) {
    return simnet.callPublicFn(
      TEST_CONTRACT,
      "create-invoice",
      [
        Cl.uint(amount),
        Cl.stringUtf8(memo),
        Cl.none(),
        Cl.uint(expiresInBlocks),
        Cl.bool(allowPartial),
        Cl.bool(allowOverpay),
        Cl.uint(tokenType),
      ],
      sender,
    );
  }

  describe("Payments (sBTC variant via mock SIP-010)", () => {

    beforeEach(() => {
      // Mint generous balance to payer so payments succeed
      mintMockSbtc(payer1, 10_000_000);
      registerMerchantTest(merchant1);
    });

    it("allows payer to pay an invoice (sBTC flow)", () => {
      createInvoiceTest(merchant1, 100000);
      const result = simnet.callPublicFn(
        TEST_CONTRACT,
        "pay-invoice",
        [Cl.uint(1), Cl.uint(100000)],
        payer1,
      );
      expect(result.result).toHaveClarityType(ClarityType.ResponseOk);
    });

    it("allows pay-invoice-exact shortcut (sBTC flow)", () => {
      createInvoiceTest(merchant1, 100000);
      const result = simnet.callPublicFn(
        TEST_CONTRACT,
        "pay-invoice-exact",
        [Cl.uint(1)],
        payer1,
      );
      expect(result.result).toHaveClarityType(ClarityType.ResponseOk);
    });

    it("allows direct payment to merchant (sBTC flow)", () => {
      const result = simnet.callPublicFn(
        TEST_CONTRACT,
        "pay-merchant-direct",
        [Cl.principal(merchant1), Cl.uint(50000), Cl.stringUtf8("Thanks!")],
        payer1,
      );
      expect(result.result).toHaveClarityType(ClarityType.ResponseOk);
    });

    it("prevents underpayment when partial not allowed (sBTC flow)", () => {
      createInvoiceTest(merchant1, 100000);
      const result = simnet.callPublicFn(
        TEST_CONTRACT,
        "pay-invoice",
        [Cl.uint(1), Cl.uint(50000)],
        payer1,
      );
      expect(result.result).toBeErr(Cl.uint(4002)); // ERR_INSUFFICIENT_PAYMENT
    });
  });

  describe("Refunds (sBTC variant via mock SIP-010)", () => {

    beforeEach(() => {
      // Mint generous balances:
      //   payer1 — needs balance to pay the invoice
      //   merchant1 — receives payment minus fee, then needs balance to
      //     fund the refund. The post-payment merchant balance is amount-fee;
      //     for a full refund (which transfers `amount` back to the payer)
      //     they would be slightly short. Minting extra balance here avoids
      //     bookkeeping noise so tests assert only refund-logic behaviour.
      mintMockSbtc(payer1, 10_000_000);
      mintMockSbtc(merchant1, 10_000_000);
      registerMerchantTest(merchant1);
      createInvoiceTest(merchant1, 100000, "Refund test");
      const payResult = simnet.callPublicFn(
        TEST_CONTRACT,
        "pay-invoice",
        [Cl.uint(1), Cl.uint(100000)],
        payer1,
      );
      expect(payResult.result).toHaveClarityType(ClarityType.ResponseOk);
    });

    it("allows merchant to process partial refund (sBTC flow)", () => {
      const result = simnet.callPublicFn(
        TEST_CONTRACT,
        "refund-invoice",
        [
          Cl.uint(1),
          Cl.uint(50000),
          Cl.stringUtf8("Partial refund — customer dissatisfied"),
        ],
        merchant1,
      );
      expect(result.result).toHaveClarityType(ClarityType.ResponseOk);

      const refundable = simnet.callReadOnlyFn(
        TEST_CONTRACT,
        "get-refundable-amount",
        [Cl.uint(1)],
        deployer,
      );
      expect(refundable.result).toBeUint(50000);
    });

    it("allows merchant to process full refund (sBTC flow)", () => {
      const result = simnet.callPublicFn(
        TEST_CONTRACT,
        "refund-invoice-full",
        [Cl.uint(1), Cl.stringUtf8("Full refund — order cancelled")],
        merchant1,
      );
      expect(result.result).toHaveClarityType(ClarityType.ResponseOk);

      const refundable = simnet.callReadOnlyFn(
        TEST_CONTRACT,
        "get-refundable-amount",
        [Cl.uint(1)],
        deployer,
      );
      expect(refundable.result).toBeUint(0);
    });

    it("prevents non-merchant from refunding (sBTC flow)", () => {
      const result = simnet.callPublicFn(
        TEST_CONTRACT,
        "refund-invoice",
        [Cl.uint(1), Cl.uint(50000), Cl.stringUtf8("Hacked")],
        payer1, // not the merchant
      );
      expect(result.result).toBeErr(Cl.uint(1001)); // ERR_NOT_AUTHORIZED
    });

    it("prevents refunding more than paid (sBTC flow)", () => {
      const result = simnet.callPublicFn(
        TEST_CONTRACT,
        "refund-invoice",
        [
          Cl.uint(1),
          Cl.uint(200000), // 2x the paid amount
          Cl.stringUtf8("Over-refund attempt"),
        ],
        merchant1,
      );
      expect(result.result).toBeErr(Cl.uint(4004)); // ERR_REFUND_EXCEEDS_PAID
    });

    it("prevents zero amount refund (sBTC flow)", () => {
      const result = simnet.callPublicFn(
        TEST_CONTRACT,
        "refund-invoice",
        [Cl.uint(1), Cl.uint(0), Cl.stringUtf8("Zero refund")],
        merchant1,
      );
      expect(result.result).toBeErr(Cl.uint(3006)); // ERR_INVALID_AMOUNT
    });
  });

  // =============================================
  // SUBSCRIPTION TESTS
  // =============================================

  describe("Subscriptions", () => {

    beforeEach(() => {
      registerMerchant(merchant1);
    });

    it("allows subscriber to create a subscription", () => {
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "create-subscription",
        [
          Cl.principal(merchant1),
          Cl.stringUtf8("Monthly Plan"),
          Cl.uint(10000),
          Cl.uint(4320), // ~monthly
        ],
        payer1,
      );
      expect(result.result).toHaveClarityType(ClarityType.ResponseOk);
      expect(result.result).toBeOk(Cl.uint(1));
    });

    it("prevents subscription with too short interval", () => {
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "create-subscription",
        [Cl.principal(merchant1), Cl.stringUtf8("Bad Plan"), Cl.uint(10000), Cl.uint(100)],
        payer1,
      );
      expect(result.result).toBeErr(Cl.uint(3006)); // ERR_INVALID_AMOUNT (interval < MIN)
    });

    it("prevents subscription to non-merchant", () => {
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "create-subscription",
        [Cl.principal(payer2), Cl.stringUtf8("Plan"), Cl.uint(10000), Cl.uint(4320)],
        payer1,
      );
      expect(result.result).toBeErr(Cl.uint(2001)); // ERR_MERCHANT_NOT_FOUND
    });

    it("allows subscriber to cancel subscription", () => {
      simnet.callPublicFn(
        CONTRACT_NAME,
        "create-subscription",
        [Cl.principal(merchant1), Cl.stringUtf8("Plan"), Cl.uint(10000), Cl.uint(4320)],
        payer1,
      );
      const result = simnet.callPublicFn(CONTRACT_NAME, "cancel-subscription", [Cl.uint(1)], payer1);
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it("allows merchant to cancel subscription", () => {
      simnet.callPublicFn(
        CONTRACT_NAME,
        "create-subscription",
        [Cl.principal(merchant1), Cl.stringUtf8("Plan"), Cl.uint(10000), Cl.uint(4320)],
        payer1,
      );
      const result = simnet.callPublicFn(CONTRACT_NAME, "cancel-subscription", [Cl.uint(1)], merchant1);
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it("allows subscriber to pause active subscription", () => {
      simnet.callPublicFn(
        CONTRACT_NAME,
        "create-subscription",
        [Cl.principal(merchant1), Cl.stringUtf8("Plan"), Cl.uint(10000), Cl.uint(4320)],
        payer1,
      );
      const result = simnet.callPublicFn(CONTRACT_NAME, "pause-subscription", [Cl.uint(1)], payer1);
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it("allows subscriber to resume paused subscription", () => {
      simnet.callPublicFn(
        CONTRACT_NAME,
        "create-subscription",
        [Cl.principal(merchant1), Cl.stringUtf8("Plan"), Cl.uint(10000), Cl.uint(4320)],
        payer1,
      );
      simnet.callPublicFn(CONTRACT_NAME, "pause-subscription", [Cl.uint(1)], payer1);
      const result = simnet.callPublicFn(CONTRACT_NAME, "resume-subscription", [Cl.uint(1)], payer1);
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it("prevents non-subscriber from pausing", () => {
      simnet.callPublicFn(
        CONTRACT_NAME,
        "create-subscription",
        [Cl.principal(merchant1), Cl.stringUtf8("Plan"), Cl.uint(10000), Cl.uint(4320)],
        payer1,
      );
      const result = simnet.callPublicFn(CONTRACT_NAME, "pause-subscription", [Cl.uint(1)], payer2);
      expect(result.result).toBeErr(Cl.uint(1001)); // ERR_NOT_AUTHORIZED
    });

    it("prevents pausing already paused subscription", () => {
      simnet.callPublicFn(
        CONTRACT_NAME,
        "create-subscription",
        [Cl.principal(merchant1), Cl.stringUtf8("Plan"), Cl.uint(10000), Cl.uint(4320)],
        payer1,
      );
      simnet.callPublicFn(CONTRACT_NAME, "pause-subscription", [Cl.uint(1)], payer1);
      const result = simnet.callPublicFn(CONTRACT_NAME, "pause-subscription", [Cl.uint(1)], payer1);
      expect(result.result).toBeErr(Cl.uint(5002)); // ERR_SUBSCRIPTION_INACTIVE
    });
  });

  // =============================================
  // READ-ONLY FUNCTION TESTS
  // =============================================

  describe("Read-Only Functions", () => {

    beforeEach(() => {
      registerMerchant(merchant1);
    });

    it("returns merchant info", () => {
      const result = simnet.callReadOnlyFn(CONTRACT_NAME, "get-merchant", [Cl.principal(merchant1)], deployer);
      expect(result.result).toHaveClarityType(ClarityType.OptionalSome);
    });

    it("returns none for non-existent merchant", () => {
      const result = simnet.callReadOnlyFn(CONTRACT_NAME, "get-merchant", [Cl.principal(payer1)], deployer);
      expect(result.result).toHaveClarityType(ClarityType.OptionalNone);
    });

    it("checks is-merchant", () => {
      const yes = simnet.callReadOnlyFn(CONTRACT_NAME, "is-merchant", [Cl.principal(merchant1)], deployer);
      expect(yes.result).toBeBool(true);
      const no = simnet.callReadOnlyFn(CONTRACT_NAME, "is-merchant", [Cl.principal(payer1)], deployer);
      expect(no.result).toBeBool(false);
    });

    it("returns invoice details", () => {
      createInvoice(merchant1, 75000, "Order #123", 288);
      const result = simnet.callReadOnlyFn(CONTRACT_NAME, "get-invoice", [Cl.uint(1)], deployer);
      expect(result.result).toHaveClarityType(ClarityType.OptionalSome);
    });

    it("checks if invoice is payable", () => {
      createInvoice(merchant1, 75000, "Test", 288);
      const result = simnet.callReadOnlyFn(CONTRACT_NAME, "is-invoice-payable", [Cl.uint(1)], deployer);
      expect(result.result).toBeBool(true);
    });

    it("returns invoice remaining amount", () => {
      createInvoice(merchant1, 75000, "Test", 288);
      const result = simnet.callReadOnlyFn(CONTRACT_NAME, "get-invoice-remaining", [Cl.uint(1)], deployer);
      expect(result.result).toBeUint(75000);
    });

    it("returns refundable amount", () => {
      createInvoice(merchant1, 75000, "Test", 288);
      // No payment yet — refundable should be 0
      const result = simnet.callReadOnlyFn(CONTRACT_NAME, "get-refundable-amount", [Cl.uint(1)], deployer);
      expect(result.result).toBeUint(0);
    });

    it("returns invoice payment count", () => {
      createInvoice(merchant1, 75000, "Test", 288);
      const result = simnet.callReadOnlyFn(CONTRACT_NAME, "get-invoice-payment-count", [Cl.uint(1)], deployer);
      expect(result.result).toBeUint(0);
    });

    it("calculates payment breakdown correctly", () => {
      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "calculate-payment-breakdown",
        [Cl.uint(10000)],
        deployer,
      );
      // 0.5% fee = 50 satoshis, merchant gets 9950
      expect(result.result).toBeTuple({
        total: Cl.uint(10000),
        fee: Cl.uint(50),
        "merchant-receives": Cl.uint(9950),
        "fee-percentage": Cl.uint(50),
      });
    });

    it("returns platform stats", () => {
      const result = simnet.callReadOnlyFn(CONTRACT_NAME, "get-platform-stats", [], deployer);
      expect(result.result).toHaveClarityType(ClarityType.Tuple);
    });

    it("returns contract config", () => {
      const result = simnet.callReadOnlyFn(CONTRACT_NAME, "get-contract-config", [], deployer);
      expect(result.result).toHaveClarityType(ClarityType.Tuple);
    });

    it("returns correct status names", () => {
      const pending = simnet.callReadOnlyFn(CONTRACT_NAME, "get-status-name", [Cl.uint(0)], deployer);
      expect(pending.result).toBeAscii("pending");
      const paid = simnet.callReadOnlyFn(CONTRACT_NAME, "get-status-name", [Cl.uint(2)], deployer);
      expect(paid.result).toBeAscii("paid");
    });

    it("returns subscription details", () => {
      simnet.callPublicFn(
        CONTRACT_NAME,
        "create-subscription",
        [Cl.principal(merchant1), Cl.stringUtf8("Plan"), Cl.uint(10000), Cl.uint(4320)],
        payer1,
      );
      const result = simnet.callReadOnlyFn(CONTRACT_NAME, "get-subscription", [Cl.uint(1)], deployer);
      expect(result.result).toHaveClarityType(ClarityType.OptionalSome);
    });

    it("checks is-subscription-due", () => {
      simnet.callPublicFn(
        CONTRACT_NAME,
        "create-subscription",
        [Cl.principal(merchant1), Cl.stringUtf8("Plan"), Cl.uint(10000), Cl.uint(4320)],
        payer1,
      );
      // Just created — next-payment-at is burn-block-height, so it should be due
      const result = simnet.callReadOnlyFn(CONTRACT_NAME, "is-subscription-due", [Cl.uint(1)], deployer);
      expect(result.result).toBeBool(true);
    });

    it("check-is-owner succeeds for deployer", () => {
      const result = simnet.callReadOnlyFn(CONTRACT_NAME, "check-is-owner", [], deployer);
      expect(result.result).toHaveClarityType(ClarityType.ResponseOk);
    });

    it("check-is-owner fails for non-owner", () => {
      const result = simnet.callReadOnlyFn(CONTRACT_NAME, "check-is-owner", [], payer1);
      expect(result.result).toHaveClarityType(ClarityType.ResponseErr);
    });

    it("check-is-operational succeeds when not paused", () => {
      const result = simnet.callReadOnlyFn(CONTRACT_NAME, "check-is-operational", [], deployer);
      expect(result.result).toHaveClarityType(ClarityType.ResponseOk);
    });
  });

  // =============================================
  // ADMIN FUNCTION TESTS
  // =============================================

  describe("Admin Functions", () => {

    it("allows owner to set fee recipient", () => {
      const result = simnet.callPublicFn(CONTRACT_NAME, "set-fee-recipient", [Cl.principal(merchant2)], deployer);
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it("prevents non-owner from setting fee recipient", () => {
      const result = simnet.callPublicFn(CONTRACT_NAME, "set-fee-recipient", [Cl.principal(merchant2)], payer1);
      expect(result.result).toBeErr(Cl.uint(1001)); // ERR_NOT_AUTHORIZED
    });

    it("allows owner to pause contract", () => {
      const result = simnet.callPublicFn(CONTRACT_NAME, "pause-contract", [], deployer);
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it("allows owner to unpause contract", () => {
      simnet.callPublicFn(CONTRACT_NAME, "pause-contract", [], deployer);
      const result = simnet.callPublicFn(CONTRACT_NAME, "unpause-contract", [], deployer);
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it("prevents non-owner from pausing", () => {
      const result = simnet.callPublicFn(CONTRACT_NAME, "pause-contract", [], payer1);
      expect(result.result).toBeErr(Cl.uint(1001)); // ERR_NOT_AUTHORIZED
    });

    it("blocks operations when paused", () => {
      simnet.callPublicFn(CONTRACT_NAME, "pause-contract", [], deployer);
      const result = registerMerchant(merchant1);
      expect(result.result).toBeErr(Cl.uint(1002)); // ERR_CONTRACT_PAUSED
    });

    it("allows owner to set platform fee", () => {
      const result = simnet.callPublicFn(CONTRACT_NAME, "set-platform-fee", [Cl.uint(100)], deployer);
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it("prevents fee change exceeding max delta", () => {
      // Current fee is 50 BPS, max change is +100 BPS, so 151 should succeed but 251 should fail
      // set to 150 (within +100 range of 50)
      simnet.callPublicFn(CONTRACT_NAME, "set-platform-fee", [Cl.uint(150)], deployer);
      // now try to jump to 500 (350 above 150, exceeds +100 cap)
      const result = simnet.callPublicFn(CONTRACT_NAME, "set-platform-fee", [Cl.uint(500)], deployer);
      expect(result.result).toBeErr(Cl.uint(6001)); // ERR_FEE_CHANGE_TOO_LARGE
    });

    it("prevents non-owner from setting fee", () => {
      const result = simnet.callPublicFn(CONTRACT_NAME, "set-platform-fee", [Cl.uint(100)], payer1);
      expect(result.result).toBeErr(Cl.uint(1001)); // ERR_NOT_AUTHORIZED
    });

    it("allows owner to initiate ownership transfer", () => {
      const result = simnet.callPublicFn(CONTRACT_NAME, "transfer-ownership", [Cl.principal(merchant1)], deployer);
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it("allows new owner to accept ownership", () => {
      simnet.callPublicFn(CONTRACT_NAME, "transfer-ownership", [Cl.principal(merchant1)], deployer);
      const result = simnet.callPublicFn(CONTRACT_NAME, "accept-ownership", [], merchant1);
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it("prevents wrong address from accepting ownership", () => {
      simnet.callPublicFn(CONTRACT_NAME, "transfer-ownership", [Cl.principal(merchant1)], deployer);
      const result = simnet.callPublicFn(CONTRACT_NAME, "accept-ownership", [], payer1);
      expect(result.result).toBeErr(Cl.uint(1001)); // ERR_NOT_AUTHORIZED
    });

    it("allows owner to cancel ownership transfer", () => {
      simnet.callPublicFn(CONTRACT_NAME, "transfer-ownership", [Cl.principal(merchant1)], deployer);
      const result = simnet.callPublicFn(CONTRACT_NAME, "cancel-ownership-transfer", [], deployer);
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it("allows owner to verify merchant", () => {
      registerMerchant(merchant1);
      const result = simnet.callPublicFn(CONTRACT_NAME, "verify-merchant", [Cl.principal(merchant1)], deployer);
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it("prevents non-owner from verifying merchant", () => {
      registerMerchant(merchant1);
      const result = simnet.callPublicFn(CONTRACT_NAME, "verify-merchant", [Cl.principal(merchant1)], payer1);
      expect(result.result).toBeErr(Cl.uint(1001)); // ERR_NOT_AUTHORIZED
    });

    it("allows owner to suspend merchant", () => {
      registerMerchant(merchant1);
      const result = simnet.callPublicFn(CONTRACT_NAME, "suspend-merchant", [Cl.principal(merchant1)], deployer);
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it("prevents non-owner from suspending merchant", () => {
      registerMerchant(merchant1);
      const result = simnet.callPublicFn(CONTRACT_NAME, "suspend-merchant", [Cl.principal(merchant1)], payer1);
      expect(result.result).toBeErr(Cl.uint(1001)); // ERR_NOT_AUTHORIZED
    });
  });

});
