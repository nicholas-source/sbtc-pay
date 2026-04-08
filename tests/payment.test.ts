
import { Cl, ClarityType } from "@stacks/transactions";
import { describe, expect, it, beforeEach } from "vitest";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const merchant1 = accounts.get("wallet_1")!;
const merchant2 = accounts.get("wallet_2")!;
const payer1 = accounts.get("wallet_3")!;
const payer2 = accounts.get("wallet_4")!;

const CONTRACT_NAME = "payment";

describe("sBTC Pay - Merchant Payment Widget", () => {
  
  // =============================================
  // MERCHANT REGISTRATION TESTS
  // =============================================
  
  describe("Merchant Registration", () => {
    
    it("allows a new merchant to register", () => {
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "register-merchant",
        [
          Cl.stringUtf8("Coffee Shop"),
          Cl.some(Cl.stringUtf8("https://webhook.example.com"))
        ],
        merchant1
      );
      
      expect(result.result).toHaveClarityType(ClarityType.ResponseOk);
      expect(result.result).toBeOk(Cl.uint(1));
      
      // Verify event was emitted
      expect(result.events[0].event).toBe("print_event");
    });
    
    it("prevents duplicate merchant registration", () => {
      // First registration
      simnet.callPublicFn(
        CONTRACT_NAME,
        "register-merchant",
        [Cl.stringUtf8("Shop 1"), Cl.none()],
        merchant1
      );
      
      // Attempt duplicate registration
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "register-merchant",
        [Cl.stringUtf8("Shop 2"), Cl.none()],
        merchant1
      );
      
      expect(result.result).toBeErr(Cl.uint(1009)); // ERR_MERCHANT_EXISTS
    });
    
    it("allows merchant to update details", () => {
      // Register first
      simnet.callPublicFn(
        CONTRACT_NAME,
        "register-merchant",
        [Cl.stringUtf8("Old Name"), Cl.none()],
        merchant1
      );
      
      // Update
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "update-merchant",
        [
          Cl.stringUtf8("New Name"),
          Cl.some(Cl.stringUtf8("https://new-webhook.com"))
        ],
        merchant1
      );
      
      expect(result.result).toBeOk(Cl.bool(true));
    });
    
    it("allows merchant to deactivate account", () => {
      // Register first
      simnet.callPublicFn(
        CONTRACT_NAME,
        "register-merchant",
        [Cl.stringUtf8("Shop"), Cl.none()],
        merchant1
      );
      
      // Deactivate
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "deactivate-merchant",
        [],
        merchant1
      );
      
      expect(result.result).toBeOk(Cl.bool(true));
    });
    
  });
  
  // =============================================
  // INVOICE MANAGEMENT TESTS
  // =============================================
  
  describe("Invoice Management", () => {
    
    beforeEach(() => {
      // Register merchant before each invoice test
      simnet.callPublicFn(
        CONTRACT_NAME,
        "register-merchant",
        [Cl.stringUtf8("Test Merchant"), Cl.none()],
        merchant1
      );
    });
    
    it("allows merchant to create an invoice", () => {
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "create-invoice",
        [
          Cl.uint(100000), // 100,000 satoshis
          Cl.stringUtf8("Payment for coffee"),
          Cl.uint(144) // expires in ~1 day (144 blocks)
        ],
        merchant1
      );
      
      expect(result.result).toHaveClarityType(ClarityType.ResponseOk);
      expect(result.result).toBeOk(Cl.uint(1));
    });
    
    it("prevents non-merchant from creating invoice", () => {
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "create-invoice",
        [
          Cl.uint(100000),
          Cl.stringUtf8("Test invoice"),
          Cl.uint(144)
        ],
        payer1 // Not a registered merchant
      );
      
      expect(result.result).toBeErr(Cl.uint(1002)); // ERR_MERCHANT_NOT_FOUND
    });
    
    it("prevents creating invoice with zero amount", () => {
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "create-invoice",
        [
          Cl.uint(0), // Invalid amount
          Cl.stringUtf8("Test invoice"),
          Cl.uint(144)
        ],
        merchant1
      );
      
      expect(result.result).toBeErr(Cl.uint(1008)); // ERR_INVALID_AMOUNT
    });
    
    it("allows merchant to cancel pending invoice", () => {
      // Create invoice
      simnet.callPublicFn(
        CONTRACT_NAME,
        "create-invoice",
        [Cl.uint(50000), Cl.stringUtf8("Test"), Cl.uint(144)],
        merchant1
      );
      
      // Cancel it
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "cancel-invoice",
        [Cl.uint(1)],
        merchant1
      );
      
      expect(result.result).toBeOk(Cl.bool(true));
    });
    
    it("prevents non-merchant from cancelling invoice", () => {
      // Create invoice
      simnet.callPublicFn(
        CONTRACT_NAME,
        "create-invoice",
        [Cl.uint(50000), Cl.stringUtf8("Test"), Cl.uint(144)],
        merchant1
      );
      
      // Attempt to cancel from different account
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "cancel-invoice",
        [Cl.uint(1)],
        payer1
      );
      
      expect(result.result).toBeErr(Cl.uint(1001)); // ERR_NOT_AUTHORIZED
    });
    
  });
  
  // =============================================
  // PAYMENT TESTS
  // =============================================
  
  describe("Payments", () => {
    
    beforeEach(() => {
      // Register merchant
      simnet.callPublicFn(
        CONTRACT_NAME,
        "register-merchant",
        [Cl.stringUtf8("Test Merchant"), Cl.none()],
        merchant1
      );
      
      // Create an invoice
      simnet.callPublicFn(
        CONTRACT_NAME,
        "create-invoice",
        [
          Cl.uint(100000), // 100,000 satoshis (0.001 BTC)
          Cl.stringUtf8("Test payment"),
          Cl.uint(1000) // expires in ~1000 blocks
        ],
        merchant1
      );
    });
    
    it("allows payer to pay an invoice", () => {
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "pay-invoice",
        [Cl.uint(1)],
        payer1
      );
      
      expect(result.result).toHaveClarityType(ClarityType.ResponseOk);
      
      // Check the event for payment details
      const printEvent = result.events.find(e => e.event === "print_event");
      expect(printEvent).toBeDefined();
    });
    
    it("prevents paying same invoice twice", () => {
      // First payment
      simnet.callPublicFn(CONTRACT_NAME, "pay-invoice", [Cl.uint(1)], payer1);
      
      // Second payment attempt
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "pay-invoice",
        [Cl.uint(1)],
        payer2
      );
      
      expect(result.result).toBeErr(Cl.uint(1004)); // ERR_INVOICE_ALREADY_PAID
    });
    
    it("prevents paying cancelled invoice", () => {
      // Cancel the invoice
      simnet.callPublicFn(CONTRACT_NAME, "cancel-invoice", [Cl.uint(1)], merchant1);
      
      // Attempt to pay
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "pay-invoice",
        [Cl.uint(1)],
        payer1
      );
      
      expect(result.result).toBeErr(Cl.uint(1004)); // ERR_INVOICE_ALREADY_PAID (cancelled)
    });
    
    it("allows direct payment to merchant", () => {
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "pay-merchant",
        [
          Cl.principal(merchant1),
          Cl.uint(50000),
          Cl.stringUtf8("Tip for great service")
        ],
        payer1
      );
      
      expect(result.result).toHaveClarityType(ClarityType.ResponseOk);
    });
    
    it("prevents direct payment to non-merchant", () => {
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "pay-merchant",
        [
          Cl.principal(payer2), // Not a merchant
          Cl.uint(50000),
          Cl.stringUtf8("Test")
        ],
        payer1
      );
      
      expect(result.result).toBeErr(Cl.uint(1002)); // ERR_MERCHANT_NOT_FOUND
    });
    
  });
  
  // =============================================
  // READ-ONLY FUNCTION TESTS
  // =============================================
  
  describe("Read-Only Functions", () => {
    
    beforeEach(() => {
      simnet.callPublicFn(
        CONTRACT_NAME,
        "register-merchant",
        [Cl.stringUtf8("Test Shop"), Cl.none()],
        merchant1
      );
    });
    
    it("returns merchant info", () => {
      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-merchant",
        [Cl.principal(merchant1)],
        deployer
      );
      
      expect(result.result).toHaveClarityType(ClarityType.OptionalSome);
    });
    
    it("returns none for non-existent merchant", () => {
      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-merchant",
        [Cl.principal(payer1)],
        deployer
      );
      
      expect(result.result).toHaveClarityType(ClarityType.OptionalNone);
    });
    
    it("returns invoice details", () => {
      // Create an invoice first
      simnet.callPublicFn(
        CONTRACT_NAME,
        "create-invoice",
        [Cl.uint(75000), Cl.stringUtf8("Order #123"), Cl.uint(288)],
        merchant1
      );
      
      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-invoice",
        [Cl.uint(1)],
        deployer
      );
      
      expect(result.result).toHaveClarityType(ClarityType.OptionalSome);
    });
    
    it("checks if invoice is payable", () => {
      simnet.callPublicFn(
        CONTRACT_NAME,
        "create-invoice",
        [Cl.uint(75000), Cl.stringUtf8("Test"), Cl.uint(288)],
        merchant1
      );
      
      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "is-invoice-payable",
        [Cl.uint(1)],
        deployer
      );
      
      expect(result.result).toBeBool(true);
    });
    
    it("calculates payment breakdown correctly", () => {
      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "calculate-payment-breakdown",
        [Cl.uint(10000)], // 10,000 satoshis
        deployer
      );
      
      // 0.5% fee = 50 satoshis
      // Merchant receives 9,950 satoshis
      expect(result.result).toBeTuple({
        total: Cl.uint(10000),
        fee: Cl.uint(50),
        "merchant-receives": Cl.uint(9950)
      });
    });
    
    it("returns platform stats", () => {
      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-platform-stats",
        [],
        deployer
      );
      
      expect(result.result).toHaveClarityType(ClarityType.Tuple);
    });
    
    it("returns correct invoice status names", () => {
      const pending = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-invoice-status-name",
        [Cl.uint(0)],
        deployer
      );
      expect(pending.result).toBeAscii("pending");
      
      const paid = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-invoice-status-name",
        [Cl.uint(1)],
        deployer
      );
      expect(paid.result).toBeAscii("paid");
    });
    
  });
  
  // =============================================
  // ADMIN FUNCTION TESTS
  // =============================================
  
  describe("Admin Functions", () => {
    
    it("allows owner to set fee recipient", () => {
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "set-fee-recipient",
        [Cl.principal(merchant2)],
        deployer
      );
      
      expect(result.result).toBeOk(Cl.bool(true));
    });
    
    it("prevents non-owner from setting fee recipient", () => {
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "set-fee-recipient",
        [Cl.principal(merchant2)],
        payer1
      );
      
      expect(result.result).toBeErr(Cl.uint(1001)); // ERR_NOT_AUTHORIZED
    });
    
  });
  
});
