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
  CONTRACT_ERRORS,
} from "@/lib/stacks/contract";
import { supabase } from "@/lib/supabase/client";

export interface PlatformStats {
  totalMerchants: number;
  totalInvoices: number;
  totalSubscriptions: number;
  totalVolume: number;
  feesCollected: number;
}

export interface MerchantEntry {
  id: string;
  name: string;
  address: string;
  isVerified: boolean;
  isSuspended: boolean;
  registeredAt: Date;
  invoiceCount: number;
  totalVolume: number;
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
    totalVolume: 0,
    feesCollected: 0,
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
            totalVolume: Number(statsResult.value.totalVolume),
            feesCollected: Number(statsResult.value.totalFeesCollected),
          }
        : get().stats;

      const config = configResult.status === "fulfilled" ? configResult.value : null;

      // Fetch ALL merchants (admin needs full visibility, no wallet-scoped RLS)
      const { data: merchantRows } = await supabase
        .from("merchants")
        .select("*")
        .order("id", { ascending: false });

      const merchants: MerchantEntry[] = (merchantRows ?? []).map((m) => ({
        id: `M-${m.id}`,
        name: m.name || "Unknown",
        address: m.principal,
        isVerified: m.is_verified ?? false,
        isSuspended: !(m.is_active ?? true),
        registeredAt: new Date(m.created_at),
        invoiceCount: m.invoice_count ?? 0,
        totalVolume: m.total_received ?? 0,
      }));

      set({
        stats,
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
    set({ pendingAction: "recipient" });
    try {
      toast.info("Please confirm in your wallet");
      await setRecipientOnChain(addr);
      set({ feeRecipient: addr });
      toast.success("Fee recipient updated");
    } catch (err) {
      toast.error(contractErrorMsg(err));
    } finally {
      set({ pendingAction: null });
    }
  },

  initiateOwnershipTransfer: async (newOwner) => {
    set({ pendingAction: "transfer" });
    try {
      toast.info("Please confirm in your wallet");
      await transferOnChain(newOwner);
      set({ pendingOwner: newOwner });
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
