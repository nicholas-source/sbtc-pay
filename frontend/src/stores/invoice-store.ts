import { create } from "zustand";
import { supabase, supabaseWithWallet } from "@/lib/supabase/client";
import { cancelInvoice as cancelInvoiceOnChain, refundInvoice as refundInvoiceOnChain, getMerchant as getMerchantOnChain } from "@/lib/stacks/contract";
import { API_URL } from "@/lib/stacks/config";
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
  // Persist any invoice that originated locally (has a txId) and isn't yet
  // confirmed in Supabase. This includes pure optimistic (dbId=0) and
  // backfilled (dbId>0 but Supabase insert may have failed).
  const pending = invoices.filter((inv) => inv.txId);
  if (pending.length === 0) {
    localStorage.removeItem(OPTIMISTIC_STORAGE_KEY);
    return;
  }
  localStorage.setItem(OPTIMISTIC_STORAGE_KEY, JSON.stringify(pending));
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
  /** Backfill an optimistic invoice from on-chain tx data into Supabase */
  backfillFromChain: (txId: string, optimisticId: string, merchantPrincipal: string) => Promise<void>;
}

// DB status (contract u0–u5) → frontend string
export const STATUS_MAP: Record<number, InvoiceStatus> = {
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
    expiresAt: blockHeightToDate(row.created_at, row.created_at_block, row.expires_at_block),
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

/**
 * Convert a block-height-based expiration to a Date.
 * Returns null if the invoice never expires (expires_at_block <= created_at_block or 0).
 * Uses ~10 min/block average for Stacks and anchors to the invoice creation timestamp.
 */
function blockHeightToDate(createdAt: string, createdAtBlock: number, expiresAtBlock: number): Date | null {
  if (!expiresAtBlock || expiresAtBlock <= createdAtBlock) return null;
  const blockDelta = expiresAtBlock - createdAtBlock;
  const msFromCreation = blockDelta * 10 * 60 * 1000; // ~10 min per block
  const createdTime = new Date(createdAt).getTime();
  return new Date(createdTime + msFromCreation);
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
        // Keep all pending invoices (optimistic or backfilled-but-not-indexed)
        const pending = get().invoices.filter((inv) => inv.txId);
        saveOptimisticToStorage(pending);
        set({ invoices: pending, isLoading: false });
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

      // Preserve pending invoices that aren't yet in Supabase.
      // This covers both pure optimistic (dbId === 0) AND backfilled (dbId > 0 but
      // Supabase insert failed or chainhook hasn't indexed yet).
      const supabaseIds = new Set(invoices.map((inv) => inv.dbId));
      const pending = get().invoices.filter((inv) => {
        // Already in Supabase results — drop the local copy
        if (inv.dbId > 0 && supabaseIds.has(inv.dbId)) return false;
        // Backfilled invoice not yet in Supabase — keep it
        if (inv.dbId > 0 && !supabaseIds.has(inv.dbId)) return true;
        // Pure optimistic (dbId === 0) — keep unless a matching real one appeared
        if (inv.dbId === 0) {
          return !invoices.some(
            (real) => real.amount === inv.amount
              && real.merchantAddress === inv.merchantAddress
              && real.memo === inv.memo,
          );
        }
        return false;
      });

      saveOptimisticToStorage(pending);
      set({ invoices: [...pending, ...invoices], isLoading: false });
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

  backfillFromChain: async (txId, optimisticId, merchantPrincipal) => {
    try {
      const cleanTxId = txId.startsWith("0x") ? txId : `0x${txId}`;
      const res = await fetch(`${API_URL}/extended/v1/tx/${cleanTxId}`);
      if (!res.ok) return;
      const tx = await res.json();
      if (tx.tx_status !== "success") return;

      // Parse (ok uN) to get on-chain invoice ID
      const resultRepr: string = tx.tx_result?.repr || "";
      const match = resultRepr.match(/\(ok u(\d+)\)/);
      if (!match) return;
      const onchainId = parseInt(match[1], 10);

      const blockHeight = tx.block_height || 0;

      // Parse contract call args
      const args: Record<string, string> = {};
      for (const a of tx.contract_call?.function_args || []) {
        args[a.name] = a.repr;
      }

      const amount = parseInt((args["amount"] || "u0").replace("u", ""), 10);
      const memo = (args["memo"] || "").replace(/^u"/, "").replace(/"$/, "");
      const referenceId = (args["reference-id"] || "").replace(/^\(some u"/, "").replace(/"\)$/, "").replace(/^none$/, "");
      const expiresInBlocks = parseInt((args["expires-in-blocks"] || "u0").replace("u", ""), 10);
      const allowPartial = args["allow-partial"] === "true";
      const allowOverpay = args["allow-overpay"] === "true";

      const db = supabaseWithWallet(merchantPrincipal);

      // Check if already in Supabase
      const { data: existing } = await db
        .from("invoices")
        .select("id")
        .eq("id", onchainId)
        .maybeSingle();

      if (!existing) {
        // Ensure the merchant row exists in Supabase (may not if chainhook is delayed)
        let merchantId: number | null = null;
        const { data: merchant } = await db
          .from("merchants")
          .select("id")
          .eq("principal", merchantPrincipal)
          .maybeSingle();

        if (merchant) {
          merchantId = merchant.id;
        } else {
          // Merchant missing from Supabase — read on-chain and insert
          const onChainMerchant = await getMerchantOnChain(merchantPrincipal);
          if (onChainMerchant) {
            merchantId = onChainMerchant.id;
            await db.from("merchants").upsert({
              id: onChainMerchant.id,
              principal: merchantPrincipal,
              name: onChainMerchant.name,
              description: onChainMerchant.description,
              logo_url: onChainMerchant.logoUrl,
              webhook_url: onChainMerchant.webhookUrl,
              is_active: onChainMerchant.isActive,
              is_verified: onChainMerchant.isVerified,
            }, { onConflict: "id" });
          }
        }

        if (merchantId !== null) {
          const { error } = await db.from("invoices").insert({
            id: onchainId,
            merchant_id: merchantId,
            merchant_principal: merchantPrincipal,
            amount,
            amount_paid: 0,
            amount_refunded: 0,
            memo,
            reference_id: referenceId || null,
            status: 0,
            allow_partial: allowPartial,
            allow_overpay: allowOverpay,
            created_at_block: blockHeight,
            expires_at_block: expiresInBlocks > 0 ? blockHeight + expiresInBlocks : blockHeight + 52560,
          });
          if (error) console.error("backfill invoice insert failed:", error.message);
        } else {
          console.error("backfillFromChain: could not resolve merchant_id for", merchantPrincipal);
        }
      }

      // Update the optimistic invoice in the local store with the real dbId
      set((state) => {
        const updated = state.invoices.map((inv) => {
          if (inv.id !== optimisticId) return inv;
          return { ...inv, id: `INV-${onchainId}`, dbId: onchainId };
        });
        saveOptimisticToStorage(updated);
        return { invoices: updated };
      });
    } catch (err) {
      console.error("backfillFromChain failed:", err);
    }
  },
}));
