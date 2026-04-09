import { describe, it, expect } from "vitest";
import {
  CONTRACT_ERRORS,
  INVOICE_STATUS,
  SUBSCRIPTION_STATUS,
} from "@/lib/stacks/contract";

describe("CONTRACT_ERRORS", () => {
  it("maps all expected error codes", () => {
    // Auth errors
    expect(CONTRACT_ERRORS[1001]).toBe("Not authorized");
    expect(CONTRACT_ERRORS[1002]).toBe("Contract is paused");

    // Merchant errors
    expect(CONTRACT_ERRORS[2001]).toBe("Merchant not found");
    expect(CONTRACT_ERRORS[2002]).toBe("Merchant already exists");

    // Invoice errors
    expect(CONTRACT_ERRORS[3001]).toBe("Invoice not found");
    expect(CONTRACT_ERRORS[3002]).toBe("Invoice already paid");
    expect(CONTRACT_ERRORS[3003]).toBe("Invoice expired");
    expect(CONTRACT_ERRORS[3007]).toContain("Amount too low");

    // Transfer errors
    expect(CONTRACT_ERRORS[4001]).toBe("Transfer failed");
    expect(CONTRACT_ERRORS[4004]).toBe("Refund exceeds paid amount");

    // Subscription errors
    expect(CONTRACT_ERRORS[5001]).toBe("Subscription not found");
    expect(CONTRACT_ERRORS[5004]).toBe("Payment not due yet");
  });

  it("returns undefined for unknown codes", () => {
    expect(CONTRACT_ERRORS[9999]).toBeUndefined();
  });
});

describe("INVOICE_STATUS", () => {
  it("maps status codes to strings", () => {
    expect(INVOICE_STATUS[0]).toBe("pending");
    expect(INVOICE_STATUS[1]).toBe("partial");
    expect(INVOICE_STATUS[2]).toBe("paid");
    expect(INVOICE_STATUS[3]).toBe("expired");
    expect(INVOICE_STATUS[4]).toBe("cancelled");
    expect(INVOICE_STATUS[5]).toBe("refunded");
  });
});

describe("SUBSCRIPTION_STATUS", () => {
  it("maps status codes to strings", () => {
    expect(SUBSCRIPTION_STATUS[0]).toBe("active");
    expect(SUBSCRIPTION_STATUS[1]).toBe("paused");
    expect(SUBSCRIPTION_STATUS[2]).toBe("cancelled");
  });
});
