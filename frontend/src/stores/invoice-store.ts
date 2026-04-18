import { create } from "zustand";
import { supabase, supabaseWithWallet } from "@/lib/supabase/client";
import { cancelInvoice as cancelInvoiceOnChain, refundInvoice as refundInvoiceOnChain, getMerchant as getMerchantOnChain, getInvoice as getInvoiceOnChain, fetchPaymentEventsForInvoice } from "@/lib/stacks/contract";
import { API_URL, AVG_BLOCK_TIME_SECONDS, fetchBurnBlockHeight, type TokenType } from "@/lib/stacks/config";
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
  tokenType: TokenType;
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
  tokenType?: TokenType;
  txId?: string;
}

const PAGE_SIZE = 50;

interface InvoiceStore {
  invoices: Invoice[];
  isLoading: boolean;
  isFetchingMore: boolean;
  hasMore: boolean;
  error: string | null;
  fetchInvoices: (merchantPrincipal: string) => Promise<void>;
  fetchMoreInvoices: (merchantPrincipal: string) => Promise<void>;
  createInvoice: (data: CreateInvoiceData) => Invoice;
  updateInvoice: (id: string, data: Partial<Pick<Invoice, "memo" | "amount" | "referenceId">>) => void;
  cancelInvoice: (id: string) => Promise<void>;
  refundInvoice: (id: string, amount: number, reason: string) => Promise<boolean>;
  getInvoice: (id: string) => Invoice | undefined;
  simulatePayment: (id: string, amount: number) => Payment | null;
  /** Record a confirmed on-chain payment locally (optimistic update before webhook/fetch). */
  addConfirmedPayment: (invoiceDbId: number, amount: number, txId: string) => void;
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
    tokenType: (row.token_type as TokenType) || 'sbtc',
  };
}

/**
 * Convert a block-height-based expiration to a Date.
 * Returns null if the invoice never expires (expires_at_block <= created_at_block or 0).
 * Uses AVG_BLOCK_TIME_SECONDS (600s = ~10 min, Bitcoin burn block time) and anchors to the invoice creation timestamp.
 * Post-Nakamoto: Stacks blocks are ~5s, but the contract uses burn-block-height (Bitcoin L1 blocks).
 */
function blockHeightToDate(createdAt: string, createdAtBlock: number, expiresAtBlock: number): Date | null {
  if (!expiresAtBlock) return null;
  // If created_at_block > expires_at_block (e.g. mixed Stacks/burn heights), use
  // a small positive delta so the expiry is still shown rather than returning null.
  const blockDelta = expiresAtBlock > createdAtBlock
    ? expiresAtBlock - createdAtBlock
    : 6; // fallback ~12min on testnet, ~1hr on mainnet
  const msFromCreation = blockDelta * AVG_BLOCK_TIME_SECONDS * 1000;
  const createdTime = new Date(createdAt).getTime();
  if (isNaN(createdTime)) return null;
  return new Date(createdTime + msFromCreation);
}

/**
 * Reconcile Supabase invoice data against on-chain contract state.
 * Filters out v3 ghost invoices and corrects stale amounts/status.
 * Detects client-side expiration (contract stores status=pending even after expiry block).
 * Falls back to Supabase data if chain reads fail entirely.
 */
async function reconcileWithChain(
  invoices: Invoice[],
  merchantPrincipal: string,
  db: ReturnType<typeof supabaseWithWallet>,
): Promise<Invoice[]> {
  const chainable = invoices.filter((inv) => inv.dbId > 0);
  if (chainable.length === 0) return invoices;

  const [chainResults, burnHeight] = await Promise.all([
    Promise.allSettled(
      chainable.map((inv) => getInvoiceOnChain(inv.dbId, merchantPrincipal)),
    ),
    fetchBurnBlockHeight().catch(() => null as number | null),
  ]);

  // If ALL chain reads failed (API down), fall back to Supabase data
  if (chainResults.every((r) => r.status === "rejected")) {
    console.warn("[reconcile] All chain reads failed — using Supabase fallback");
    return invoices;
  }

  const reconciled: Invoice[] = [];
  const fixes: Array<{ id: number; data: Partial<Tables<'invoices'>> }> = [];

  for (let i = 0; i < chainable.length; i++) {
    const inv = chainable[i];
    const result = chainResults[i];

    if (result.status === "rejected" || !result.value) {
      continue; // not found on-chain — ghost invoice
    }

    const chain = result.value;

    // Wrong merchant — v3 ID collision
    if (chain.merchant !== merchantPrincipal) {
      continue; // merchant mismatch — v3 ID collision
    }

    const chainAmount = Number(chain.amount);
    const chainAmountPaid = Number(chain.amountPaid);
    let chainStatus = STATUS_MAP[chain.status] ?? "pending";

    // Client-side expiration: contract keeps status=pending even after expiry block
    if (
      burnHeight !== null &&
      burnHeight > 0 &&
      chain.expiresAt > 0 &&
      burnHeight > chain.expiresAt &&
      (chainStatus === "pending" || chainStatus === "partial")
    ) {
      chainStatus = "expired";
    }

    if (
      inv.amount !== chainAmount ||
      inv.amountPaid !== chainAmountPaid ||
      inv.status !== chainStatus ||
      inv.memo !== chain.memo
    ) {
      console.info(
        `[reconcile] Invoice ${inv.id}: correcting stale data ` +
        `(amount ${inv.amount}→${chainAmount}, status ${inv.status}→${chainStatus})`,
      );
      inv.amount = chainAmount;
      inv.amountPaid = chainAmountPaid;
      inv.status = chainStatus;
      inv.memo = chain.memo;
      inv.payerAddress = chain.payer || "";

      fixes.push({
        id: inv.dbId,
        data: {
          amount: chainAmount,
          amount_paid: chainAmountPaid,
          status: chain.status,
          memo: chain.memo,
          payer: chain.payer,
        },
      });
    }

    reconciled.push(inv);

    // Consistency check: detect if Supabase payment/refund history is incomplete
    const supaPaymentSum = inv.payments.reduce((sum, p) => sum + p.amount, 0);
    const supaRefundSum = inv.refunds.reduce((sum, r) => sum + r.amount, 0);
    if (supaPaymentSum !== chainAmountPaid) {
      console.warn(
        `[reconcile] Invoice ${inv.id}: payment history mismatch — ` +
        `Supabase sum=${supaPaymentSum}, on-chain amountPaid=${chainAmountPaid}`,
      );
      // Try to resolve the missing payment(s) from the blockchain
      if (chainAmountPaid > supaPaymentSum) {
        const gap = chainAmountPaid - supaPaymentSum;
        const chainEvents = await fetchPaymentEventsForInvoice(inv.dbId).catch(() => []);
        if (chainEvents.length > 0) {
          // Use blockchain-resolved payments (with real txIds)
          const existingTxIds = new Set(inv.payments.map((p) => p.txId).filter(Boolean));
          const newEvents = chainEvents.filter((ev) => !existingTxIds.has(ev.txId));
          inv.payments = [
            ...inv.payments,
            ...newEvents.map((ev) => ({
              timestamp: ev.timestamp,
              amount: ev.amount || gap,
              txId: ev.txId,
            })),
          ];
        } else {
          // Last resort: synthesize from on-chain data without txId
          inv.payments = [
            ...inv.payments,
            {
              timestamp: inv.createdAt,
              amount: gap,
              txId: "",
            },
          ];
        }
      }
    }
    if (chain.amountRefunded !== undefined) {
      const chainRefunded = Number(chain.amountRefunded);
      if (supaRefundSum !== chainRefunded) {
        console.warn(
          `[reconcile] Invoice ${inv.id}: refund history mismatch — ` +
          `Supabase sum=${supaRefundSum}, on-chain amountRefunded=${chainRefunded}`,
        );
      }
    }
  }

  // Background-fix stale Supabase rows (fire and forget)
  if (fixes.length > 0) {
    Promise.all(
      fixes.map(({ id, data }) => db.from("invoices").update(data).eq("id", id)),
    ).catch((err) => console.error("[reconcile] Background fix failed:", err));
  }

  // Include optimistic invoices (dbId <= 0)
  const optimistic = invoices.filter((inv) => inv.dbId <= 0);
  return [...optimistic, ...reconciled];
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
  isFetchingMore: false,
  hasMore: false,
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
        .order("id", { ascending: false })
        .range(0, PAGE_SIZE - 1);

      if (invErr) throw invErr;
      if (!invoiceRows || invoiceRows.length === 0) {
        // Keep all pending invoices (optimistic or backfilled-but-not-indexed)
        const pending = get().invoices.filter((inv) => inv.txId);
        saveOptimisticToStorage(pending);
        set({ invoices: pending, isLoading: false, hasMore: false });
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

      const invoicesRaw = invoiceRows.map((row) =>
        mapDbInvoice(row, paymentsByInvoice.get(row.id) ?? [], refundsByInvoice.get(row.id) ?? []),
      );

      // Reconcile with on-chain data — filters ghosts, corrects stale fields
      const invoices = await reconcileWithChain(invoicesRaw, merchantPrincipal, db);

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
      set({ invoices: [...pending, ...invoices], isLoading: false, hasMore: invoiceRows.length === PAGE_SIZE });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to fetch invoices";
      set({ error: message, isLoading: false });
    }
  },

  fetchMoreInvoices: async (merchantPrincipal) => {
    const { invoices: current, isFetchingMore, hasMore } = get();
    if (isFetchingMore || !hasMore) return;
    set({ isFetchingMore: true });
    try {
      const db = supabaseWithWallet(merchantPrincipal);
      // Offset = number of Supabase-sourced invoices (exclude optimistic dbId===0)
      const offset = current.filter((inv) => inv.dbId > 0).length;
      const { data: invoiceRows, error: invErr } = await db
        .from("invoices")
        .select("*")
        .eq("merchant_principal", merchantPrincipal)
        .order("id", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (invErr) throw invErr;
      if (!invoiceRows || invoiceRows.length === 0) {
        set({ isFetchingMore: false, hasMore: false });
        return;
      }

      const invoiceIds = invoiceRows.map((r) => r.id);
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

      const newInvoices = invoiceRows.map((row) =>
        mapDbInvoice(row, paymentsByInvoice.get(row.id) ?? [], refundsByInvoice.get(row.id) ?? []),
      );

      const reconciled = await reconcileWithChain(newInvoices, merchantPrincipal, db);

      // Deduplicate against existing invoices
      const existingIds = new Set(current.map((inv) => inv.dbId));
      const unique = reconciled.filter((inv) => !existingIds.has(inv.dbId));

      set({
        invoices: [...current, ...unique],
        isFetchingMore: false,
        hasMore: invoiceRows.length === PAGE_SIZE,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load more invoices";
      set({ error: message, isFetchingMore: false });
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
      tokenType: data.tokenType ?? 'sbtc',
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
          tokenType: invoice.tokenType,
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

  addConfirmedPayment: (invoiceDbId, amount, txId) => {
    const invoiceKey = `INV-${invoiceDbId}`;
    const invoice = get().invoices.find((inv) => inv.id === invoiceKey);
    if (!invoice || amount <= 0) return;
    // Don't double-add if a payment with this txId already exists
    if (invoice.payments.some((p) => p.txId === txId)) return;

    const payment: Payment = {
      timestamp: new Date(),
      amount,
      txId,
    };

    set((state) => ({
      invoices: state.invoices.map((inv) => {
        if (inv.id !== invoiceKey) return inv;
        const newPaid = inv.amountPaid + amount;
        const newStatus: InvoiceStatus = newPaid >= inv.amount ? "paid" : "partial";
        return {
          ...inv,
          amountPaid: newPaid,
          status: newStatus,
          payments: [...inv.payments, payment],
        };
      }),
    }));
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
      const tokenTypeArg = parseInt((args["token-type"] || "u0").replace("u", ""), 10);
      const tokenType: TokenType = tokenTypeArg === 1 ? 'stx' : 'sbtc';

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
          // Merchant missing from Supabase — read on-chain and sync via RPC
          const onChainMerchant = await getMerchantOnChain(merchantPrincipal);
          if (onChainMerchant) {
            merchantId = onChainMerchant.id;
            await db.rpc("sync_merchant_cache", {
              p_id: onChainMerchant.id,
              p_principal: merchantPrincipal,
              p_name: onChainMerchant.name,
              p_description: onChainMerchant.description ?? null,
              p_logo_url: onChainMerchant.logoUrl ?? null,
              p_webhook_url: onChainMerchant.webhookUrl ?? null,
              p_is_active: onChainMerchant.isActive,
              p_is_verified: onChainMerchant.isVerified,
              p_registered_at: onChainMerchant.registeredAt,
            });
          }
        }

        if (merchantId !== null) {
          const { error } = await db.from("invoices").upsert({
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
            token_type: tokenType,
          }, { onConflict: "id" });
          if (error) console.error("backfill invoice upsert failed:", error.message);
        } else {
          console.error("backfillFromChain: could not resolve merchant_id for", merchantPrincipal);
        }
      }

      // Update the optimistic invoice in the local store with the real dbId
      // Clear txId so it's no longer treated as optimistic/pending
      set((state) => {
        const updated = state.invoices.map((inv) => {
          if (inv.id !== optimisticId) return inv;
          return { ...inv, id: `INV-${onchainId}`, dbId: onchainId, txId: undefined, tokenType };
        });
        saveOptimisticToStorage(updated);
        return { invoices: updated };
      });
    } catch (err) {
      console.error("backfillFromChain failed:", err);
    }
  },
}));
