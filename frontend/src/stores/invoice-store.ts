import { create } from "zustand";
import { supabaseWithWallet } from "@/lib/supabase/client";
import { cancelInvoice as cancelInvoiceOnChain, refundInvoice as refundInvoiceOnChain } from "@/lib/stacks/contract";
import { toast } from "sonner";
import type { Tables } from "@/lib/supabase/types";

export type InvoiceStatus = "pending" | "partial" | "paid" | "expired" | "cancelled" | "refunded";

export interface Payment {
  timestamp: Date;
  amount: number;
  txId: string;
}

export interface Refund {
  timestamp: Date;
  amount: number;
  reason: string;
  txId: string;
}

export interface Invoice {
  id: string;
  dbId: number;
  amount: number;
  amountPaid: number;
  memo: string;
  referenceId: string;
  status: InvoiceStatus;
  allowPartial: boolean;
  allowOverpay: boolean;
  merchantAddress: string;
  payerAddress: string;
  createdAt: Date;
  expiresAt: Date | null;
  payments: Payment[];
  refunds: Refund[];
  /** The on-chain tx ID that created this invoice (set for optimistic invoices) */
  txId?: string;
}

// --- localStorage persistence for optimistic invoices ---
const OPTIMISTIC_STORAGE_KEY = "sbtc-pay-optimistic-invoices";

function saveOptimisticToStorage(invoices: Invoice[]) {
  const optimistic = invoices.filter((inv) => inv.dbId === 0);
  if (optimistic.length === 0) {
    localStorage.removeItem(OPTIMISTIC_STORAGE_KEY);
    return;
  }
  // Serialize dates so they survive JSON round-trip
  localStorage.setItem(OPTIMISTIC_STORAGE_KEY, JSON.stringify(optimistic));
}

function loadOptimisticFromStorage(): Invoice[] {
  try {
    const raw = localStorage.getItem(OPTIMISTIC_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Invoice[];
    // Rehydrate Date objects
    return parsed.map((inv) => ({
      ...inv,
      createdAt: new Date(inv.createdAt),
      expiresAt: inv.expiresAt ? new Date(inv.expiresAt) : null,
      payments: (inv.payments || []).map((p) => ({ ...p, timestamp: new Date(p.timestamp) })),
      refunds: (inv.refunds || []).map((r) => ({ ...r, timestamp: new Date(r.timestamp) })),
    }));
  } catch {
    localStorage.removeItem(OPTIMISTIC_STORAGE_KEY);
    return [];
  }
}

function clearOptimisticFromStorage() {
  localStorage.removeItem(OPTIMISTIC_STORAGE_KEY);
}

interface CreateInvoiceData {
  amount: number;
  memo?: string;
  referenceId?: string;
  expiresAt?: Date | null;
  allowPartial?: boolean;
  allowOverpay?: boolean;
  merchantAddress?: string;
  txId?: string;
}

interface InvoiceStore {
  invoices: Invoice[];
  isLoading: boolean;
  error: string | null;
  fetchInvoices: (merchantPrincipal: string) => Promise<void>;
  createInvoice: (data: CreateInvoiceData) => Invoice;
  updateInvoice: (id: string, data: Partial<Pick<Invoice, "memo" | "amount" | "referenceId">>) => void;
  cancelInvoice: (id: string) => Promise<void>;
  refundInvoice: (id: string, amount: number, reason: string) => Promise<boolean>;
  getInvoice: (id: string) => Invoice | undefined;
  simulatePayment: (id: string, amount: number) => Payment | null;
}

// DB status (contract u0–u5) → frontend string
const STATUS_MAP: Record<number, InvoiceStatus> = {
  0: "pending",
  1: "partial",
  2: "paid",
  3: "expired",
  4: "cancelled",
  5: "refunded",
};

function mapDbInvoice(
  row: Tables<"invoices">,
  payments: Tables<"payments">[],
  refunds: Tables<"refunds">[],
): Invoice {
  return {
    id: `INV-${row.id}`,
    dbId: row.id,
    amount: row.amount,
    amountPaid: row.amount_paid,
    memo: row.memo || "",
    referenceId: row.reference_id || "",
    status: STATUS_MAP[row.status] ?? "pending",
    allowPartial: row.allow_partial,
    allowOverpay: row.allow_overpay,
    merchantAddress: row.merchant_principal,
    payerAddress: row.payer || "",
    createdAt: new Date(row.created_at),
    expiresAt: null, // block-based expiry; not date-based
    payments: payments.map((p) => ({
      timestamp: new Date(p.created_at),
      amount: p.amount,
      txId: p.tx_id || "",
    })),
    refunds: refunds.map((r) => ({
      timestamp: new Date(r.created_at),
      amount: r.amount,
      reason: r.reason || "",
      txId: r.tx_id || "",
    })),
  };
}

function generateId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 4; i++) result += chars[Math.floor(Math.random() * chars.length)];
  return `INV-${result}`;
}

function randomTxId(): string {
  const hex = "0123456789abcdef";
  let r = "0x";
  for (let i = 0; i < 40; i++) r += hex[Math.floor(Math.random() * 16)];
  return r;
}

export const useInvoiceStore = create<InvoiceStore>((set, get) => ({
  invoices: loadOptimisticFromStorage(),
  isLoading: false,
  error: null,

  fetchInvoices: async (merchantPrincipal) => {
    set({ isLoading: true, error: null });
    try {
      // Use wallet-aware client so RLS allows reading all merchant invoices
      const db = supabaseWithWallet(merchantPrincipal);
      const { data: invoiceRows, error: invErr } = await db
        .from("invoices")
        .select("*")
        .eq("merchant_principal", merchantPrincipal)
        .order("id", { ascending: false });

      if (invErr) throw invErr;
      if (!invoiceRows || invoiceRows.length === 0) {
        // Keep optimistic invoices (dbId === 0) that haven't been indexed yet
        const optimistic = get().invoices.filter((inv) => inv.dbId === 0);
        saveOptimisticToStorage(optimistic);
        set({ invoices: optimistic, isLoading: false });
        return;
      }

      const invoiceIds = invoiceRows.map((r) => r.id);

      // Fetch related payments and refunds in parallel
      const [paymentsRes, refundsRes] = await Promise.all([
        db.from("payments").select("*").in("invoice_id", invoiceIds),
        db.from("refunds").select("*").in("invoice_id", invoiceIds),
      ]);

      const paymentsByInvoice = new Map<number, Tables<"payments">[]>();
      for (const p of paymentsRes.data ?? []) {
        const arr = paymentsByInvoice.get(p.invoice_id) ?? [];
        arr.push(p);
        paymentsByInvoice.set(p.invoice_id, arr);
      }

      const refundsByInvoice = new Map<number, Tables<"refunds">[]>();
      for (const r of refundsRes.data ?? []) {
        const arr = refundsByInvoice.get(r.invoice_id) ?? [];
        arr.push(r);
        refundsByInvoice.set(r.invoice_id, arr);
      }

      const invoices = invoiceRows.map((row) =>
        mapDbInvoice(row, paymentsByInvoice.get(row.id) ?? [], refundsByInvoice.get(row.id) ?? []),
      );

      // Preserve optimistic invoices (dbId === 0) that haven't been indexed yet.
      // Match by memo + amount + merchantAddress to detect when the on-chain version appears.
      const optimistic = get().invoices.filter((inv) => {
        if (inv.dbId !== 0) return false;
        // If a real invoice with same memo + amount + merchant exists, the optimistic one is superseded
        return !invoices.some(
          (real) => real.amount === inv.amount
            && real.merchantAddress === inv.merchantAddress
            && real.memo === inv.memo,
        );
      });

      saveOptimisticToStorage(optimistic);
      set({ invoices: [...optimistic, ...invoices], isLoading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to fetch invoices";
      set({ error: message, isLoading: false });
    }
  },

  createInvoice: (data) => {
    // Optimistic local add — real invoice is created on-chain,
    // then indexed by chainhook webhook into Supabase.
    // This gives immediate UI feedback while waiting for confirmation.
    const invoice: Invoice = {
      id: generateId(),
      dbId: 0,
      amount: data.amount,
      amountPaid: 0,
      memo: data.memo || "",
      referenceId: data.referenceId || "",
      status: "pending",
      allowPartial: data.allowPartial ?? false,
      allowOverpay: data.allowOverpay ?? false,
      merchantAddress: data.merchantAddress || "",
      payerAddress: "",
      createdAt: new Date(),
      expiresAt: data.expiresAt ?? null,
      payments: [],
      refunds: [],
      txId: data.txId,
    };
    set((state) => {
      const next = [invoice, ...state.invoices];
      saveOptimisticToStorage(next);
      return { invoices: next };
    });
    return invoice;
  },

  updateInvoice: (id, data) => {
    set((state) => ({
      invoices: state.invoices.map((inv) => (inv.id === id ? { ...inv, ...data } : inv)),
    }));
  },

  cancelInvoice: async (id) => {
    const invoice = get().invoices.find((inv) => inv.id === id);
    if (!invoice) return;

    if (invoice.dbId > 0) {
      // On-chain invoice — call contract
      try {
        toast.info("Please confirm the cancellation in your wallet");
        await cancelInvoiceOnChain(invoice.dbId);
        toast.success("Cancellation submitted!", { description: "Will update once confirmed." });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Cancellation failed";
        toast.error("Cancellation failed", { description: message });
        return; // Don't update local state if tx failed
      }
    }
    // Optimistic local update
    set((state) => ({
      invoices: state.invoices.map((inv) =>
        inv.id === id ? { ...inv, status: "cancelled" as InvoiceStatus } : inv
      ),
    }));
  },

  refundInvoice: async (id, amount, reason) => {
    const invoice = get().invoices.find((inv) => inv.id === id);
    if (!invoice || amount <= 0 || amount > invoice.amountPaid) return false;

    if (invoice.dbId > 0) {
      // On-chain invoice — call contract
      try {
        toast.info("Please confirm the refund in your wallet");
        await refundInvoiceOnChain({
          invoiceId: invoice.dbId,
          refundAmount: BigInt(amount),
          reason,
          merchantAddress: invoice.merchantAddress,
        });
        toast.success("Refund submitted!", { description: "Will update once confirmed." });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Refund failed";
        toast.error("Refund failed", { description: message });
        return false; // Don't update local state if tx failed
      }
    }

    // Optimistic local update
    const refund: Refund = {
      timestamp: new Date(),
      amount,
      reason,
      txId: "",
    };

    set((state) => ({
      invoices: state.invoices.map((inv) => {
        if (inv.id !== id) return inv;
        const newPaid = inv.amountPaid - amount;
        const newStatus: InvoiceStatus =
          newPaid <= 0 ? "refunded" : newPaid < inv.amount ? "partial" : inv.status;
        return {
          ...inv,
          amountPaid: Math.max(0, newPaid),
          status: newStatus,
          refunds: [...inv.refunds, refund],
        };
      }),
    }));
    return true;
  },

  getInvoice: (id) => get().invoices.find((inv) => inv.id === id),

  simulatePayment: (id, amount) => {
    const invoice = get().invoices.find((inv) => inv.id === id);
    if (!invoice || amount <= 0) return null;
    if (invoice.status !== "pending" && invoice.status !== "partial") return null;

    const payment: Payment = {
      timestamp: new Date(),
      amount,
      txId: randomTxId(),
    };

    set((state) => ({
      invoices: state.invoices.map((inv) => {
        if (inv.id !== id) return inv;
        const newPaid = inv.amountPaid + amount;
        const newStatus: InvoiceStatus = newPaid >= inv.amount ? "paid" : "partial";
        return {
          ...inv,
          amountPaid: newPaid,
          status: newStatus,
          payerAddress: inv.payerAddress || "",
          payments: [...inv.payments, payment],
        };
      }),
    }));

    return payment;
  },
}));
