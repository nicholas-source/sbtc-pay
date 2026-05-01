import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildVolume, buildConversions, buildMix } from "@/lib/analytics";
import type { PaymentRow, InvoiceRow } from "@/lib/analytics";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Return an ISO string for "today at noon UTC minus N days" */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}

function makePayment(overrides: Partial<PaymentRow> = {}): PaymentRow {
  return { amount: 1000, fee: 10, token_type: "sbtc", created_at: daysAgo(0), ...overrides };
}

function makeInvoice(overrides: Partial<InvoiceRow> = {}): InvoiceRow {
  return { status: "paid", created_at: daysAgo(0), ...overrides };
}

// Fix the clock so "today" is stable across the whole test file
const FIXED_NOW = new Date("2026-05-01T12:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

// ── buildVolume ───────────────────────────────────────────────────────────────

describe("buildVolume", () => {
  it("returns exactly `days` entries", () => {
    expect(buildVolume([], 7)).toHaveLength(7);
    expect(buildVolume([], 30)).toHaveLength(30);
    expect(buildVolume([], 90)).toHaveLength(90);
  });

  it("all counts are zero when there are no payments", () => {
    const result = buildVolume([], 7);
    for (const d of result) {
      expect(d.sbtc).toBe(0);
      expect(d.stx).toBe(0);
      expect(d.sbtcVol).toBe(0);
      expect(d.stxVol).toBe(0);
    }
  });

  it("bins an sBTC payment into today's bucket", () => {
    const payments = [makePayment({ amount: 5000, fee: 50, token_type: "sbtc", created_at: daysAgo(0) })];
    const result = buildVolume(payments, 7);
    const today = result[result.length - 1];
    expect(today.sbtc).toBe(1);
    expect(today.sbtcVol).toBe(5000);
    expect(today.stx).toBe(0);
  });

  it("bins an STX payment into today's bucket", () => {
    const payments = [makePayment({ amount: 2000000, fee: null, token_type: "stx", created_at: daysAgo(0) })];
    const result = buildVolume(payments, 7);
    const today = result[result.length - 1];
    expect(today.stx).toBe(1);
    expect(today.stxVol).toBe(2000000);
    expect(today.sbtc).toBe(0);
  });

  it("bins a payment from 6 days ago into the first bucket of a 7-day window", () => {
    const payments = [makePayment({ created_at: daysAgo(6) })];
    const result = buildVolume(payments, 7);
    expect(result[0].sbtc).toBe(1);
  });

  it("discards payments older than the window", () => {
    const payments = [makePayment({ created_at: daysAgo(8) })];
    const result = buildVolume(payments, 7);
    const total = result.reduce((s, d) => s + d.sbtc + d.stx, 0);
    expect(total).toBe(0);
  });

  it("accumulates multiple payments in the same bucket", () => {
    const payments = [
      makePayment({ amount: 1000, token_type: "sbtc", created_at: daysAgo(0) }),
      makePayment({ amount: 2000, token_type: "sbtc", created_at: daysAgo(0) }),
    ];
    const result = buildVolume(payments, 7);
    const today = result[result.length - 1];
    expect(today.sbtc).toBe(2);
    expect(today.sbtcVol).toBe(3000);
  });

  it("spreads payments across multiple days correctly", () => {
    const payments = [
      makePayment({ created_at: daysAgo(0) }),
      makePayment({ created_at: daysAgo(1) }),
      makePayment({ created_at: daysAgo(2) }),
    ];
    const result = buildVolume(payments, 7);
    const last3 = result.slice(-3);
    expect(last3[0].sbtc).toBe(1); // 2 days ago
    expect(last3[1].sbtc).toBe(1); // yesterday
    expect(last3[2].sbtc).toBe(1); // today
  });

  it("uses short (EEE) labels for 7-day window", () => {
    const result = buildVolume([], 7);
    // All labels should be 3 chars like "Mon", "Tue", etc.
    for (const d of result) {
      expect(d.date).toMatch(/^[A-Z][a-z]{2}$/);
    }
  });

  it("uses medium (MMM d) labels for 30-day window", () => {
    const result = buildVolume([], 30);
    // Should contain a space, e.g. "Apr 1"
    for (const d of result) {
      expect(d.date).toMatch(/^[A-Z][a-z]+ \d+$/);
    }
  });
});

// ── buildConversions ──────────────────────────────────────────────────────────

describe("buildConversions", () => {
  it("returns exactly `days` entries", () => {
    expect(buildConversions([], 7)).toHaveLength(7);
    expect(buildConversions([], 30)).toHaveLength(30);
  });

  it("all counts are zero when there are no invoices", () => {
    const result = buildConversions([], 7);
    for (const d of result) {
      expect(d.paid).toBe(0);
      expect(d.total).toBe(0);
      expect(d.rate).toBe(0);
    }
  });

  it("counts a paid invoice in today's bucket", () => {
    const invoices = [makeInvoice({ status: "paid", created_at: daysAgo(0) })];
    const result = buildConversions(invoices, 7);
    const today = result[result.length - 1];
    expect(today.paid).toBe(1);
    expect(today.total).toBe(1);
    expect(today.rate).toBe(100);
  });

  it("counts a pending invoice but does not add to paid", () => {
    const invoices = [makeInvoice({ status: "pending", created_at: daysAgo(0) })];
    const result = buildConversions(invoices, 7);
    const today = result[result.length - 1];
    expect(today.paid).toBe(0);
    expect(today.other).toBe(1);
    expect(today.total).toBe(1);
    expect(today.rate).toBe(0);
  });

  it("computes rate as Math.round(paid/total * 100)", () => {
    const invoices = [
      makeInvoice({ status: "paid",    created_at: daysAgo(0) }),
      makeInvoice({ status: "paid",    created_at: daysAgo(0) }),
      makeInvoice({ status: "expired", created_at: daysAgo(0) }),
    ];
    const result = buildConversions(invoices, 7);
    const today = result[result.length - 1];
    expect(today.rate).toBe(67); // Math.round(2/3 * 100)
  });

  it("other = total - paid", () => {
    const invoices = [
      makeInvoice({ status: "paid",      created_at: daysAgo(0) }),
      makeInvoice({ status: "expired",   created_at: daysAgo(0) }),
      makeInvoice({ status: "cancelled", created_at: daysAgo(0) }),
    ];
    const result = buildConversions(invoices, 7);
    const today = result[result.length - 1];
    expect(today.paid).toBe(1);
    expect(today.other).toBe(2);
  });

  it("bins an invoice from 6 days ago into the first bucket", () => {
    const invoices = [makeInvoice({ created_at: daysAgo(6) })];
    const result = buildConversions(invoices, 7);
    expect(result[0].total).toBe(1);
  });

  it("discards invoices older than the window", () => {
    const invoices = [makeInvoice({ created_at: daysAgo(8) })];
    const result = buildConversions(invoices, 7);
    const total = result.reduce((s, d) => s + d.total, 0);
    expect(total).toBe(0);
  });

  it("uses short (EEE) labels for 7-day window", () => {
    const result = buildConversions([], 7);
    for (const d of result) {
      expect(d.date).toMatch(/^[A-Z][a-z]{2}$/);
    }
  });

  it("labels are derived from local-time date (no UTC midnight shift)", () => {
    // The label for today should match what date-fns format() gives for "today"
    // with a 7-day window → EEE format. We can verify today's label specifically.
    const result = buildConversions([], 7);
    const todayLabel = result[result.length - 1].date;
    // FIXED_NOW is 2026-05-01 12:00 UTC which is a Friday
    expect(todayLabel).toBe("Fri");
  });
});

// ── buildMix ──────────────────────────────────────────────────────────────────

describe("buildMix", () => {
  it("returns all-zero mix for empty payments", () => {
    const mix = buildMix([]);
    expect(mix).toEqual({ sbtcCount: 0, stxCount: 0, sbtcVol: 0, stxVol: 0, sbtcFees: 0, stxFees: 0 });
  });

  it("counts a single sBTC payment", () => {
    const mix = buildMix([makePayment({ amount: 1000, fee: 5, token_type: "sbtc" })]);
    expect(mix.sbtcCount).toBe(1);
    expect(mix.sbtcVol).toBe(1000);
    expect(mix.sbtcFees).toBe(5);
    expect(mix.stxCount).toBe(0);
  });

  it("counts a single STX payment", () => {
    const mix = buildMix([makePayment({ amount: 500000, fee: 200, token_type: "stx" })]);
    expect(mix.stxCount).toBe(1);
    expect(mix.stxVol).toBe(500000);
    expect(mix.stxFees).toBe(200);
    expect(mix.sbtcCount).toBe(0);
  });

  it("handles null fee as 0", () => {
    const mix = buildMix([makePayment({ fee: null, token_type: "sbtc" })]);
    expect(mix.sbtcFees).toBe(0);
  });

  it("accumulates counts and volumes across many payments", () => {
    const payments: PaymentRow[] = [
      makePayment({ amount: 1000, fee: 10,  token_type: "sbtc" }),
      makePayment({ amount: 2000, fee: 20,  token_type: "sbtc" }),
      makePayment({ amount: 3000, fee: 30,  token_type: "stx"  }),
      makePayment({ amount: 4000, fee: null, token_type: "stx" }),
    ];
    const mix = buildMix(payments);
    expect(mix.sbtcCount).toBe(2);
    expect(mix.sbtcVol).toBe(3000);
    expect(mix.sbtcFees).toBe(30);
    expect(mix.stxCount).toBe(2);
    expect(mix.stxVol).toBe(7000);
    expect(mix.stxFees).toBe(30);
  });

  it("treats any non-'stx' token_type as sBTC", () => {
    const mix = buildMix([makePayment({ token_type: "SBTC" }), makePayment({ token_type: "btc" })]);
    expect(mix.sbtcCount).toBe(2);
    expect(mix.stxCount).toBe(0);
  });
});
