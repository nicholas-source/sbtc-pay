import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  connect as stacksConnect,
  disconnect as stacksDisconnect,
  isConnected as stacksIsConnected,
  getLocalStorage,
} from '@stacks/connect';
import { NETWORK_MODE, API_URL, SBTC_CONTRACT_ID } from '@/lib/stacks/config';

export type WalletProvider = 'leather' | 'xverse' | 'asigna' | null;
export type Network = 'mainnet' | 'testnet';

interface WalletState {
  // Connection
  isConnected: boolean;
  isConnecting: boolean;
  provider: WalletProvider;
  address: string | null;
  publicKey: string | null;
  network: Network;

  // Balances (in base units: microSTX and sats)
  stxBalance: bigint;
  sbtcBalance: bigint;
  btcPriceUsd: number;

  // Actions
  connect: () => Promise<void>;
  disconnect: () => void;
  checkConnection: () => void;
  fetchBalances: () => Promise<void>;
  fetchBtcPrice: () => Promise<void>;
  setNetwork: (network: Network) => void;
}

// Helper to extract STX address from connection response
function extractStxAddress(addresses: Array<{ address: string; symbol?: string }>): string | null {
  // Find STX address (starts with SP on mainnet, ST on testnet)
  const stxAddr = addresses.find(
    (a) => a.symbol === 'STX' || a.address.startsWith('SP') || a.address.startsWith('ST')
  );
  return stxAddr?.address || null;
}

// Helper to extract public key
function extractPublicKey(addresses: Array<{ address: string; publicKey?: string; symbol?: string }>): string | null {
  const stxAddr = addresses.find(
    (a) => a.symbol === 'STX' || a.address.startsWith('SP') || a.address.startsWith('ST')
  );
  return stxAddr?.publicKey || null;
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set, get) => ({
      isConnected: false,
      isConnecting: false,
      provider: null,
      address: null,
      publicKey: null,
      network: NETWORK_MODE,
      stxBalance: BigInt(0),
      sbtcBalance: BigInt(0),
      btcPriceUsd: 97500, // Default BTC price

      connect: async () => {
        set({ isConnecting: true });
        try {
          // Use the new @stacks/connect API
          const response = await stacksConnect();

          if (response?.addresses && response.addresses.length > 0) {
            const stxAddress = extractStxAddress(response.addresses);
            const publicKey = extractPublicKey(response.addresses);

            if (stxAddress) {
              set({
                isConnected: true,
                isConnecting: false,
                address: stxAddress,
                publicKey,
              });

              // Fetch balances after connecting
              get().fetchBalances();
              get().fetchBtcPrice();
            } else {
              throw new Error('No STX address found in wallet response');
            }
          } else {
            throw new Error('No addresses returned from wallet');
          }
        } catch (error) {
          console.error('Wallet connection failed:', error);
          set({
            isConnected: false,
            isConnecting: false,
            address: null,
            publicKey: null,
          });
          throw error;
        }
      },

      disconnect: () => {
        stacksDisconnect();
        set({
          isConnected: false,
          isConnecting: false,
          provider: null,
          address: null,
          publicKey: null,
          stxBalance: BigInt(0),
          sbtcBalance: BigInt(0),
        });
      },

      checkConnection: () => {
        // Check if we have a stored connection
        if (stacksIsConnected()) {
          const stored = getLocalStorage();
          if (stored?.addresses?.stx?.[0]) {
            const stxAddr = stored.addresses.stx[0];
            set({
              isConnected: true,
              address: stxAddr.address,
              publicKey: stxAddr.publicKey || null,
            });
            // Refresh balances
            get().fetchBalances();
            get().fetchBtcPrice();
          }
        }
      },

      fetchBalances: async () => {
        const { address } = get();
        if (!address) return;

        try {
          // Fetch balances from Hiro API
          const response = await fetch(
            `${API_URL}/extended/v1/address/${address}/balances`
          );
          const data = await response.json();

          // Extract STX balance (in microSTX)
          const stxBalance = BigInt(data.stx?.balance || '0');

          // Extract sBTC balance
          const sbtcKey = `${SBTC_CONTRACT_ID}::sbtc-token`;
          const sbtcBalance = BigInt(
            data.fungible_tokens?.[sbtcKey]?.balance || '0'
          );

          set({ stxBalance, sbtcBalance });
        } catch (error) {
          console.error('Failed to fetch balances:', error);
        }
      },

      fetchBtcPrice: async () => {
        try {
          const response = await fetch(
            'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd'
          );
          const data = await response.json();
          const btcPriceUsd = data.bitcoin?.usd || 97500;
          set({ btcPriceUsd });
        } catch (error) {
          console.error('Failed to fetch BTC price:', error);
        }
      },

      setNetwork: (network) => set({ network }),
    }),
    {
      name: 'sbtc-pay-wallet',
      partialize: (state) => ({
        // Only persist non-sensitive data
        network: state.network,
        btcPriceUsd: state.btcPriceUsd,
      }),
    }
  )
);

// Utility hooks for formatted values
export function useFormattedStxBalance(): string {
  const stxBalance = useWalletStore((s) => s.stxBalance);
  // Convert microSTX to STX (1 STX = 1,000,000 microSTX)
  const stx = Number(stxBalance) / 1_000_000;
  return stx.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

export function useFormattedSbtcBalance(): string {
  const sbtcBalance = useWalletStore((s) => s.sbtcBalance);
  // sbtcBalance is in sats
  return Number(sbtcBalance).toLocaleString();
}

export function useSbtcBalanceInBtc(): string {
  const sbtcBalance = useWalletStore((s) => s.sbtcBalance);
  const btc = Number(sbtcBalance) / 100_000_000;
  return btc.toFixed(8);
}

export function useSbtcBalanceInUsd(): string {
  const sbtcBalance = useWalletStore((s) => s.sbtcBalance);
  const btcPriceUsd = useWalletStore((s) => s.btcPriceUsd);
  const btc = Number(sbtcBalance) / 100_000_000;
  return (btc * btcPriceUsd).toFixed(2);
}
