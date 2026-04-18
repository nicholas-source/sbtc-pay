import { describe, it, expect, beforeEach } from "vitest";
import { useInvoiceStore } from "@/stores/invoice-store";

// Reset the store before each test
beforeEach(() => {
  useInvoiceStore.setState({ invoices: [], isLoading: false, error: null });
});

describe("invoice-store", () => {
  describe("createInvoice (local optimistic)", () => {
    it("creates an invoice with correct defaults", () => {
      const { createInvoice } = useInvoiceStore.getState();
      const inv = createInvoice({ amount: 9000 });

      expect(inv.id).toMatch(/^INV-/);
      expect(inv.dbId).toBe(0);
      expect(inv.amount).toBe(9000);
      expect(inv.amountPaid).toBe(0);
      expect(inv.status).toBe("pending");
      expect(inv.allowPartial).toBe(false);
      expect(inv.allowOverpay).toBe(false);
      expect(inv.payments).toEqual([]);
      expect(inv.refunds).toEqual([]);
    });

    it("respects optional fields", () => {
      const { createInvoice } = useInvoiceStore.getState();
      const inv = createInvoice({
        amount: 50000,
        memo: "Test memo",
        referenceId: "REF-001",
        allowPartial: true,
        allowOverpay: true,
      });

      expect(inv.memo).toBe("Test memo");
      expect(inv.referenceId).toBe("REF-001");
      expect(inv.allowPartial).toBe(true);
      expect(inv.allowOverpay).toBe(true);
    });

    it("prepends new invoice to the list", () => {
      const { createInvoice } = useInvoiceStore.getState();
      const inv1 = createInvoice({ amount: 1000 });
      const inv2 = createInvoice({ amount: 2000 });

      const { invoices } = useInvoiceStore.getState();
      expect(invoices).toHaveLength(2);
      expect(invoices[0].id).toBe(inv2.id);
      expect(invoices[1].id).toBe(inv1.id);
    });
  });

  describe("updateInvoice", () => {
    it("updates memo on existing invoice (local-only, dbId=0)", async () => {
      const { createInvoice, updateInvoice } = useInvoiceStore.getState();
      const inv = createInvoice({ amount: 5000 });

      await updateInvoice(inv.id, { amount: 5000, memo: "Updated memo", expiresInBlocks: 1008 });

      const updated = useInvoiceStore.getState().invoices.find((i) => i.id === inv.id);
      expect(updated?.memo).toBe("Updated memo");
    });

    it("does not affect other invoices", async () => {
      const { createInvoice, updateInvoice } = useInvoiceStore.getState();
      const inv1 = createInvoice({ amount: 1000, memo: "first" });
      const inv2 = createInvoice({ amount: 2000, memo: "second" });

      await updateInvoice(inv1.id, { amount: 1000, memo: "changed", expiresInBlocks: 1008 });

      const invoices = useInvoiceStore.getState().invoices;
      expect(invoices.find((i) => i.id === inv1.id)?.memo).toBe("changed");
      expect(invoices.find((i) => i.id === inv2.id)?.memo).toBe("second");
    });
  });

  describe("cancelInvoice (local-only, dbId=0)", () => {
    it("sets status to cancelled", async () => {
      const { createInvoice, cancelInvoice } = useInvoiceStore.getState();
      const inv = createInvoice({ amount: 5000 });

      await cancelInvoice(inv.id);

      const updated = useInvoiceStore.getState().invoices.find((i) => i.id === inv.id);
      expect(updated?.status).toBe("cancelled");
    });
  });

  describe("simulatePayment", () => {
    it("simulates a full payment", () => {
      const { createInvoice, simulatePayment } = useInvoiceStore.getState();
      const inv = createInvoice({ amount: 9000 });

      const payment = simulatePayment(inv.id, 9000);

      expect(payment).not.toBeNull();
      expect(payment!.amount).toBe(9000);
      expect(payment!.txId).toMatch(/^0x/);

      const updated = useInvoiceStore.getState().invoices.find((i) => i.id === inv.id);
      expect(updated?.status).toBe("paid");
      expect(updated?.amountPaid).toBe(9000);
      expect(updated?.payments).toHaveLength(1);
    });

    it("simulates a partial payment", () => {
      const { createInvoice, simulatePayment } = useInvoiceStore.getState();
      const inv = createInvoice({ amount: 10000, allowPartial: true });

      const payment = simulatePayment(inv.id, 5000);

      const updated = useInvoiceStore.getState().invoices.find((i) => i.id === inv.id);
      expect(updated?.status).toBe("partial");
      expect(updated?.amountPaid).toBe(5000);
    });

    it("returns null for non-existent invoice", () => {
      const { simulatePayment } = useInvoiceStore.getState();
      expect(simulatePayment("FAKE-ID", 1000)).toBeNull();
    });

    it("returns null for 0 amount", () => {
      const { createInvoice, simulatePayment } = useInvoiceStore.getState();
      const inv = createInvoice({ amount: 5000 });
      expect(simulatePayment(inv.id, 0)).toBeNull();
    });

    it("rejects payment on cancelled invoice", () => {
      const { createInvoice, cancelInvoice, simulatePayment } = useInvoiceStore.getState();
      const inv = createInvoice({ amount: 5000 });

      cancelInvoice(inv.id);

      const payment = simulatePayment(inv.id, 5000);
      expect(payment).toBeNull();
    });
  });

  describe("refundInvoice (local-only, dbId=0)", () => {
    it("refunds a paid invoice", async () => {
      const { createInvoice, simulatePayment, refundInvoice } = useInvoiceStore.getState();
      const inv = createInvoice({ amount: 9000 });
      simulatePayment(inv.id, 9000);

      const success = await refundInvoice(inv.id, 9000, "Customer request");
      expect(success).toBe(true);

      const updated = useInvoiceStore.getState().invoices.find((i) => i.id === inv.id);
      expect(updated?.status).toBe("refunded");
      expect(updated?.amountPaid).toBe(0);
      expect(updated?.refunds).toHaveLength(1);
      expect(updated?.refunds[0].reason).toBe("Customer request");
    });

    it("partial refund sets status to partial", async () => {
      const { createInvoice, simulatePayment, refundInvoice } = useInvoiceStore.getState();
      const inv = createInvoice({ amount: 10000 });
      simulatePayment(inv.id, 10000);

      const success = await refundInvoice(inv.id, 3000, "Partial refund");
      expect(success).toBe(true);

      const updated = useInvoiceStore.getState().invoices.find((i) => i.id === inv.id);
      expect(updated?.status).toBe("partial");
      expect(updated?.amountPaid).toBe(7000);
    });

    it("rejects refund exceeding paid amount", async () => {
      const { createInvoice, simulatePayment, refundInvoice } = useInvoiceStore.getState();
      const inv = createInvoice({ amount: 5000 });
      simulatePayment(inv.id, 5000);

      const success = await refundInvoice(inv.id, 6000, "Over-refund");
      expect(success).toBe(false);
    });

    it("rejects refund on unpaid invoice", async () => {
      const { createInvoice, refundInvoice } = useInvoiceStore.getState();
      const inv = createInvoice({ amount: 5000 });

      const success = await refundInvoice(inv.id, 1000, "No payment");
      expect(success).toBe(false);
    });
  });

  describe("getInvoice", () => {
    it("finds invoice by id", () => {
      const { createInvoice, getInvoice } = useInvoiceStore.getState();
      const inv = createInvoice({ amount: 5000 });

      expect(getInvoice(inv.id)).toBeDefined();
      expect(getInvoice(inv.id)?.amount).toBe(5000);
    });

    it("returns undefined for missing id", () => {
      const { getInvoice } = useInvoiceStore.getState();
      expect(getInvoice("NONEXISTENT")).toBeUndefined();
    });
  });
});
