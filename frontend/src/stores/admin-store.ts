import { create } from "zustand";
import { toast } from "sonner";
import {
  getPlatformStats as getStatsOnChain,
  getContractConfig as getConfigOnChain,
  pauseContract as pauseContractOnChain,
  unpauseContract as unpauseContractOnChain,
  setPlatformFee as setFeeOnChain,
  setFeeRecipient as setRecipientOnChain,
  transferOwnership as transferOnChain,
  cancelOwnershipTransfer as cancelTransferOnChain,
  acceptOwnership as acceptOwnershipOnChain,
  verifyMerchant as verifyOnChain,
  suspendMerchant as suspendOnChain,
  getMerchant as getMerchantOnChain,
  getInvoice as getInvoiceOnChain,
  CONTRACT_ERRORS,
} from "@/lib/stacks/contract";
import { supabase } from "@/lib/supabase/client";
import { fetchBurnBlockHeight } from "@/lib/stacks/config";

/** Run async tasks with concurrency limit to avoid 429s from Hiro API. */
async function withConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      try { results[i] = { status: 'fulfilled', value: await tasks[i]() }; }
      catch (reason) { results[i] = { status: 'rejected', reason }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, () => worker()));
  return results;
}
import { isValidStacksAddress } from "@/lib/validators";

export interface PlatformStats {
  totalMerchants: number;
  totalInvoices: number;
  totalSubscriptions: number;
  totalVolumeSbtc: number;
  totalVolumeStx: number;
  feesCollectedSbtc: number;
  feesCollectedStx: number;
  invoiceBreakdown: {
    paid: number;
    pending: number;
    expired: number;
    cancelled: number;
    refunded: number;
    partial: number;
  };
}

export interface MerchantEntry {
  id: string;
  name: string;
  address: string;
  isVerified: boolean;
  isSuspended: boolean;
  registeredAt: Date;
  invoiceCount: number;
  totalVolumeSbtc: number;
  totalVolumeStx: number;
}

interface AdminState {
  isContractOwner: boolean;
  contractPaused: boolean;
  feeBps: number;
  feeRecipient: string;
  pendingOwner: string | null;
  currentOwner: string;
  merchants: MerchantEntry[];
  stats: PlatformStats;
  isLoading: boolean;
  pendingAction: string | null; // tracks which action is in-flight

  fetchAdminData: (walletAddress: string) => Promise<void>;
  toggleContractPause: () => Promise<void>;
  updateFeeBps: (bps: number) => Promise<void>;
  updateFeeRecipient: (addr: string) => Promise<void>;
  initiateOwnershipTransfer: (newOwner: string) => Promise<void>;
  cancelOwnershipTransfer: () => Promise<void>;
  acceptOwnership: () => Promise<void>;
  verifyMerchant: (id: string) => Promise<void>;
  suspendMerchant: (id: string) => Promise<void>;
}

/** Map contract error codes to user-friendly messages */
function contractErrorMsg(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  for (const [code, label] of Object.entries(CONTRACT_ERRORS)) {
    if (msg.includes(code)) return label;
  }
  return msg;
}

export const useAdminStore = create<AdminState>((set, get) => ({
  isContractOwner: false,
  contractPaused: false,
  feeBps: 50,
  feeRecipient: "",
  pendingOwner: null,
  currentOwner: "",
  merchants: [],
  stats: {
    totalMerchants: 0,
    totalInvoices: 0,
    totalSubscriptions: 0,
    totalVolumeSbtc: 0,
    totalVolumeStx: 0,
    feesCollectedSbtc: 0,
    feesCollectedStx: 0,
    invoiceBreakdown: { paid: 0, pending: 0, expired: 0, cancelled: 0, refunded: 0, partial: 0 },
  },
  isLoading: false,
  pendingAction: null,

  fetchAdminData: async (walletAddress) => {
    set({ isLoading: true });
    try {
      const [statsResult, configResult] = await Promise.allSettled([
        getStatsOnChain(walletAddress),
        getConfigOnChain(walletAddress),
      ]);

      const stats = statsResult.status === "fulfilled" && statsResult.value
        ? {
            totalMerchants: statsResult.value.totalMerchants,
            totalInvoices: statsResult.value.totalInvoices,
            totalSubscriptions: statsResult.value.totalSubscriptions,
            totalVolumeSbtc: Number(statsResult.value.totalVolumeSbtc),
            totalVolumeStx: Number(statsResult.value.totalVolumeStx),
            feesCollectedSbtc: Number(statsResult.value.totalFeesCollectedSbtc),
            feesCollectedStx: Number(statsResult.value.totalFeesCollectedStx),
          }
        : get().stats;

      const config = configResult.status === "fulfilled" ? configResult.value : null;

      // Fetch ALL merchants (admin needs full visibility, no wallet-scoped RLS)
      const { data: merchantRows } = await supabase
        .from("merchants")
        .select("*")
        .order("id", { ascending: false });

      const merchantsFromDb: MerchantEntry[] = (merchantRows ?? []).map((m) => ({
        id: `M-${m.id}`,
        name: m.name || "Unknown",
        address: m.principal,
        isVerified: m.is_verified ?? false,
        isSuspended: !(m.is_active ?? true),
        registeredAt: new Date(m.created_at),
        invoiceCount: m.invoice_count ?? 0,
        totalVolumeSbtc: m.total_received_sbtc ?? 0,
        totalVolumeStx: m.total_received_stx ?? 0,
      }));

      // Reconcile with on-chain data (source of truth for name, status, volume)
      const merchantResults = await withConcurrency(
        merchantsFromDb.map((m) => () => getMerchantOnChain(m.address)),
        3, // max 3 concurrent to avoid 429
      );
      const merchants = merchantsFromDb.map((m, idx) => {
        const result = merchantResults[idx];
        if (result.status === 'fulfilled' && result.value) {
          const onChain = result.value;
          return {
            ...m,
            name: onChain.name || m.name,
            isVerified: onChain.isVerified,
            isSuspended: !onChain.isActive,
            invoiceCount: onChain.invoiceCount,
            totalVolumeSbtc: Number(onChain.totalReceivedSbtc),
            totalVolumeStx: Number(onChain.totalReceivedStx),
          };
        }
        return m; // fallback to cached Supabase data
      });

      // Compute invoice status breakdown with client-side expiration detection
      const breakdown = { paid: 0, pending: 0, expired: 0, cancelled: 0, refunded: 0, partial: 0 };
      try {
        const [{ data: invoiceRows }, burnHeight] = await Promise.all([
          supabase.from("invoices").select("id, status, expires_at_block"),
          fetchBurnBlockHeight().catch(() => 0),
        ]);
        const STATUS_LABELS = ["pending", "partial", "paid", "expired", "cancelled", "refunded"] as const;

        // First pass: apply expiration from Supabase data
        const stillPendingOrPartial: number[] = [];
        const rowLabels = new Map<number, string>();
        for (const row of invoiceRows ?? []) {
          let label = STATUS_LABELS[row.status] ?? "pending";
          const expiresAt = Number(row.expires_at_block) || 0;
          if (
            burnHeight > 0 &&
            expiresAt > 0 &&
            burnHeight > expiresAt &&
            (label === "pending" || label === "partial")
          ) {
            label = "expired";
          }
          rowLabels.set(row.id, label);
          // Any invoice still pending/partial needs on-chain verification
          // (Supabase expires_at_block may be stale, missing, or wrong)
          if ((label === "pending" || label === "partial") && burnHeight > 0) {
            stillPendingOrPartial.push(row.id);
          }
        }

        // Second pass: on-chain verification for all remaining pending/partial invoices
        if (stillPendingOrPartial.length > 0) {
          const senderAddr = walletAddress;
          const chainResults = await withConcurrency(
            stillPendingOrPartial.map((id) => () => getInvoiceOnChain(id, senderAddr)),
            3, // max 3 concurrent to avoid 429
          );
          chainResults.forEach((result, idx) => {
            if (result.status === "fulfilled" && result.value) {
              const onChain = result.value;
              if (onChain.expiresAt > 0 && burnHeight > onChain.expiresAt) {
                rowLabels.set(stillPendingOrPartial[idx], "expired");
              }
            }
          });
        }

        for (const label of rowLabels.values()) {
          if (label in breakdown) breakdown[label as keyof typeof breakdown]++;
        }
      } catch { /* non-critical */ }

      set({
        stats: { ...stats, invoiceBreakdown: breakdown },
        contractPaused: config?.isPaused ?? false,
        feeBps: config?.platformFeeBps ?? 50,
        feeRecipient: config?.feeRecipient ?? "",
        currentOwner: config?.owner ?? "",
        isContractOwner: config?.owner === walletAddress,
        merchants,
        isLoading: false,
      });
    } catch {
      set({ isLoading: false });
    }
  },

  toggleContractPause: async () => {
    const wasPaused = get().contractPaused;
    set({ pendingAction: "pause" });
    try {
      toast.info("Please confirm in your wallet");
      if (wasPaused) {
        await unpauseContractOnChain();
      } else {
        await pauseContractOnChain();
      }
      set({ contractPaused: !wasPaused });
      toast.success(wasPaused ? "Contract unpaused" : "Contract paused");
    } catch (err) {
      toast.error(contractErrorMsg(err));
    } finally {
      set({ pendingAction: null });
    }
  },

  updateFeeBps: async (bps) => {
    if (isNaN(bps) || bps < 0) {
      toast.error("Invalid fee value");
      return;
    }
    if (!Number.isInteger(bps)) {
      toast.error("Fee must be a whole number (no decimals)");
      return;
    }
    if (bps > 500) {
      toast.error("Maximum fee is 500 BPS (5%)");
      return;
    }
    const currentFee = get().feeBps;
    if (Math.abs(bps - currentFee) > 100) {
      toast.error(`Fee change too large: max ±100 BPS per update (current: ${currentFee})`);
      return;
    }
    set({ pendingAction: "fee" });
    try {
      toast.info("Please confirm in your wallet");
      await setFeeOnChain(bps);
      set({ feeBps: bps });
      toast.success(`Fee updated to ${(bps / 100).toFixed(2)}%`);
    } catch (err) {
      toast.error(contractErrorMsg(err));
    } finally {
      set({ pendingAction: null });
    }
  },

  updateFeeRecipient: async (addr) => {
    const trimmed = addr.trim();
    if (!isValidStacksAddress(trimmed)) {
      toast.error("Invalid Stacks address", { description: "Must start with SP, SM, ST, or SN" });
      return;
    }
    set({ pendingAction: "recipient" });
    try {
      toast.info("Please confirm in your wallet");
      await setRecipientOnChain(trimmed);
      set({ feeRecipient: trimmed });
      toast.success("Fee recipient updated");
    } catch (err) {
      toast.error(contractErrorMsg(err));
    } finally {
      set({ pendingAction: null });
    }
  },

  initiateOwnershipTransfer: async (newOwner) => {
    const trimmed = newOwner.trim();
    if (!isValidStacksAddress(trimmed)) {
      toast.error("Invalid Stacks address", { description: "Must start with SP, SM, ST, or SN" });
      return;
    }
    set({ pendingAction: "transfer" });
    try {
      toast.info("Please confirm in your wallet");
      await transferOnChain(trimmed);
      set({ pendingOwner: trimmed });
      toast.success("Ownership transfer initiated");
    } catch (err) {
      toast.error(contractErrorMsg(err));
    } finally {
      set({ pendingAction: null });
    }
  },

  cancelOwnershipTransfer: async () => {
    set({ pendingAction: "cancelTransfer" });
    try {
      toast.info("Please confirm in your wallet");
      await cancelTransferOnChain();
      set({ pendingOwner: null });
      toast.success("Ownership transfer cancelled");
    } catch (err) {
      toast.error(contractErrorMsg(err));
    } finally {
      set({ pendingAction: null });
    }
  },

  acceptOwnership: async () => {
    set({ pendingAction: "accept" });
    try {
      toast.info("Please confirm in your wallet");
      await acceptOwnershipOnChain();
      set((s) => ({ currentOwner: s.pendingOwner ?? s.currentOwner, pendingOwner: null }));
      toast.success("Ownership transferred");
    } catch (err) {
      toast.error(contractErrorMsg(err));
    } finally {
      set({ pendingAction: null });
    }
  },

  verifyMerchant: async (id) => {
    const merchant = get().merchants.find((m) => m.id === id);
    if (!merchant) return;
    set({ pendingAction: `verify-${id}` });
    try {
      toast.info("Please confirm in your wallet");
      await verifyOnChain(merchant.address);
      set((s) => ({
        merchants: s.merchants.map((m) => (m.id === id ? { ...m, isVerified: true } : m)),
      }));
      toast.success(`${merchant.name} verified`);
    } catch (err) {
      toast.error(contractErrorMsg(err));
    } finally {
      set({ pendingAction: null });
    }
  },

  suspendMerchant: async (id) => {
    const merchant = get().merchants.find((m) => m.id === id);
    if (!merchant) return;
    set({ pendingAction: `suspend-${id}` });
    try {
      toast.info("Please confirm in your wallet");
      await suspendOnChain(merchant.address);
      set((s) => ({
        merchants: s.merchants.map((m) => (m.id === id ? { ...m, isSuspended: true } : m)),
      }));
      toast.success(`${merchant.name} suspended`);
    } catch (err) {
      toast.error(contractErrorMsg(err));
    } finally {
      set({ pendingAction: null });
    }
  },
}));
