import { create } from 'zustand';

export type WalletProvider = 'leather' | 'xverse' | 'asigna' | null;
export type Network = 'mainnet' | 'testnet';

interface WalletState {
  // Connection
  isConnected: boolean;
  isConnecting: boolean;
  provider: WalletProvider;
  address: string | null;
  network: Network;

  // Balances
  stxBalance: number;
  sbtcBalance: number;
  usdRate: number; // USD per sBTC

  // Actions
  connect: (provider: WalletProvider) => Promise<void>;
  disconnect: () => void;
  setNetwork: (network: Network) => void;
  setBalances: (stx: number, sbtc: number) => void;
  setUsdRate: (rate: number) => void;
}

export const useWalletStore = create<WalletState>((set) => ({
  isConnected: false,
  isConnecting: false,
  provider: null,
  address: null,
  network: 'testnet',
  stxBalance: 0,
  sbtcBalance: 0,
  usdRate: 97500, // mock BTC price

  connect: async (provider) => {
    set({ isConnecting: true });
    // Mock wallet connection — will be replaced with real Stacks wallet integration
    await new Promise((r) => setTimeout(r, 1200));
    const mockAddress = 'SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7';
    set({
      isConnected: true,
      isConnecting: false,
      provider,
      address: mockAddress,
      stxBalance: 1250.5,
      sbtcBalance: 0.0285,
    });
  },

  disconnect: () => {
    set({
      isConnected: false,
      isConnecting: false,
      provider: null,
      address: null,
      stxBalance: 0,
      sbtcBalance: 0,
    });
  },

  setNetwork: (network) => set({ network }),
  setBalances: (stxBalance, sbtcBalance) => set({ stxBalance, sbtcBalance }),
  setUsdRate: (usdRate) => set({ usdRate }),
}));
