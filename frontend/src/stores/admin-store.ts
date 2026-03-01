import { create } from "zustand";

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

  toggleContractPause: () => void;
  updateFeeBps: (bps: number) => void;
  updateFeeRecipient: (addr: string) => void;
  initiateOwnershipTransfer: (newOwner: string) => void;
  cancelOwnershipTransfer: () => void;
  acceptOwnership: () => void;
  verifyMerchant: (id: string) => void;
  suspendMerchant: (id: string) => void;
  unsuspendMerchant: (id: string) => void;
}

const seedMerchants: MerchantEntry[] = [
  { id: "M-001", name: "sBTC Commerce", address: "SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7", isVerified: true, isSuspended: false, registeredAt: new Date("2025-11-01"), invoiceCount: 47, totalVolume: 15200000 },
  { id: "M-002", name: "Bitcoin Bazaar", address: "SP1HTBVD3JG9C05J7HBJTHGR0GGW7KXW28M5JS8QE", isVerified: true, isSuspended: false, registeredAt: new Date("2025-11-15"), invoiceCount: 23, totalVolume: 8400000 },
  { id: "M-003", name: "Stacks Shop", address: "SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE", isVerified: false, isSuspended: false, registeredAt: new Date("2025-12-01"), invoiceCount: 8, totalVolume: 2100000 },
  { id: "M-004", name: "CryptoGoods", address: "SP2C2YFP12AJZB1MAEP5RQHWER4NKFF4J5XFGYW7P", isVerified: false, isSuspended: true, registeredAt: new Date("2025-12-10"), invoiceCount: 3, totalVolume: 450000 },
  { id: "M-005", name: "DeFi Merch", address: "SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNQ60", isVerified: true, isSuspended: false, registeredAt: new Date("2026-01-05"), invoiceCount: 31, totalVolume: 11800000 },
];

export const useAdminStore = create<AdminState>((set, get) => ({
  isContractOwner: true,
  contractPaused: false,
  feeBps: 50, // 0.5%
  feeRecipient: "SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7",
  pendingOwner: null,
  currentOwner: "SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7",
  merchants: seedMerchants,
  stats: {
    totalMerchants: 5,
    totalInvoices: 112,
    totalSubscriptions: 34,
    totalVolume: 37950000,
    feesCollected: 189750,
  },

  toggleContractPause: () => set((s) => ({ contractPaused: !s.contractPaused })),
  updateFeeBps: (feeBps) => set({ feeBps }),
  updateFeeRecipient: (feeRecipient) => set({ feeRecipient }),
  initiateOwnershipTransfer: (newOwner) => set({ pendingOwner: newOwner }),
  cancelOwnershipTransfer: () => set({ pendingOwner: null }),
  acceptOwnership: () => {
    const pending = get().pendingOwner;
    if (pending) set({ currentOwner: pending, pendingOwner: null });
  },
  verifyMerchant: (id) =>
    set((s) => ({ merchants: s.merchants.map((m) => (m.id === id ? { ...m, isVerified: true } : m)) })),
  suspendMerchant: (id) =>
    set((s) => ({ merchants: s.merchants.map((m) => (m.id === id ? { ...m, isSuspended: true } : m)) })),
  unsuspendMerchant: (id) =>
    set((s) => ({ merchants: s.merchants.map((m) => (m.id === id ? { ...m, isSuspended: false } : m)) })),
}));
