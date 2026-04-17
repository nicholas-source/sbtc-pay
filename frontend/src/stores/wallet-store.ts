import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  connect as stacksConnect,
  disconnect as stacksDisconnect,
  isConnected as stacksIsConnected,
  getLocalStorage,
} from '@stacks/connect';
import { NETWORK_MODE, API_URL, SBTC_CONTRACT_ID } from '@/lib/stacks/config';
import { BTC_USD_PRICE, STX_USD_PRICE } from '@/lib/constants';

export type WalletProvider = 'leather' | 'xverse' | 'asigna' | null;
export type Network = 'mainnet' | 'testnet';

// Error types for wallet connection
export type WalletError = 
  | { type: 'network_mismatch'; detectedNetwork: Network; expectedNetwork: Network }
  | { type: 'no_address'; message: string }
  | { type: 'connection_failed'; message: string }
  | null;

// ── Multi-source price fetching ────────────────────────────────────
// Coinbase (primary): CORS-friendly, no API key, supports BTC + STX
// CoinGecko (fallback): may be CORS-blocked from browsers but try anyway

const PRICE_STALE_MS = 5 * 60 * 1000; // 5 minutes

async function fetchPriceFromCoinbase(pair: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api.coinbase.com/v2/prices/${pair}/spot`);
    if (!res.ok) return null;
    const data = await res.json();
    const price = parseFloat(data?.data?.amount);
    return isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
  }
}

async function fetchPricesFromCoinGecko(): Promise<{ btc: number | null; stx: number | null }> {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,blockstack&vs_currencies=usd'
    );
    if (!res.ok) return { btc: null, stx: null };
    const data = await res.json();
    const btc = data?.bitcoin?.usd ?? null;
    const stx = data?.blockstack?.usd ?? null;
    return { btc, stx };
  } catch {
    return { btc: null, stx: null };
  }
}

/**
 * Fetch BTC/USD and STX/USD prices.
 * Strategy: Coinbase first (CORS-friendly), CoinGecko fallback.
 * Returns null for any price that couldn't be fetched from any source.
 */
async function fetchLivePrices(): Promise<{ btcUsd: number | null; stxUsd: number | null }> {
  // Try Coinbase for both in parallel
  const [cbBtc, cbStx] = await Promise.all([
    fetchPriceFromCoinbase('BTC-USD'),
    fetchPriceFromCoinbase('STX-USD'),
  ]);

  let btcUsd = cbBtc;
  let stxUsd = cbStx;

  // If either failed, try CoinGecko as fallback
  if (btcUsd === null || stxUsd === null) {
    const cg = await fetchPricesFromCoinGecko();
    if (btcUsd === null) btcUsd = cg.btc;
    if (stxUsd === null) stxUsd = cg.stx;
  }

  return { btcUsd, stxUsd };
}

// Helper to detect network from address
function detectNetworkFromAddress(address: string): Network {
  // Testnet addresses start with ST, mainnet with SP
  return address.startsWith('ST') ? 'testnet' : 'mainnet';
}

// Helper to validate address matches expected network
function validateNetworkMatch(address: string, expectedNetwork: Network): boolean {
  const detectedNetwork = detectNetworkFromAddress(address);
  return detectedNetwork === expectedNetwork;
}

interface WalletState {
  // Connection
  isConnected: boolean;
  isConnecting: boolean;
  provider: WalletProvider;
  address: string | null;
  publicKey: string | null;
  network: Network;
  connectionError: WalletError;

  // Balances (in base units: microSTX and sats)
  stxBalance: bigint;
  sbtcBalance: bigint;
  btcPriceUsd: number;
  stxPriceUsd: number;
  priceLastUpdated: number | null; // epoch ms of last successful live fetch

  // Actions
  connect: () => Promise<void>;
  disconnect: () => void;
  checkConnection: () => void;
  fetchBalances: () => Promise<void>;
  fetchPrices: () => Promise<void>;
  setNetwork: (network: Network) => void;
  clearError: () => void;
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
      connectionError: null,
      stxBalance: BigInt(0),
      sbtcBalance: BigInt(0),
      btcPriceUsd: BTC_USD_PRICE, // Initial fallback until live fetch
      stxPriceUsd: STX_USD_PRICE, // Initial fallback until live fetch
      priceLastUpdated: null,

      connect: async () => {
        set({ isConnecting: true, connectionError: null });
        try {
          // Use the new @stacks/connect API
          const response = await stacksConnect();

          if (response?.addresses && response.addresses.length > 0) {
            const stxAddress = extractStxAddress(response.addresses);
            const publicKey = extractPublicKey(response.addresses);

            if (stxAddress) {
              // Validate that the wallet is on the correct network
              const expectedNetwork = NETWORK_MODE;
              const detectedNetwork = detectNetworkFromAddress(stxAddress);

              if (!validateNetworkMatch(stxAddress, expectedNetwork)) {
                // Network mismatch - disconnect and show error
                stacksDisconnect();
                set({
                  isConnected: false,
                  isConnecting: false,
                  address: null,
                  publicKey: null,
                  connectionError: {
                    type: 'network_mismatch',
                    detectedNetwork,
                    expectedNetwork,
                  },
                });
                return;
              }

              set({
                isConnected: true,
                isConnecting: false,
                address: stxAddress,
                publicKey,
                connectionError: null,
              });

              // Fetch balances after connecting
              get().fetchBalances();
              get().fetchPrices();
            } else {
              set({
                isConnected: false,
                isConnecting: false,
                connectionError: {
                  type: 'no_address',
                  message: 'No STX address found in wallet response',
                },
              });
            }
          } else {
            set({
              isConnected: false,
              isConnecting: false,
              connectionError: {
                type: 'no_address',
                message: 'No addresses returned from wallet',
              },
            });
          }
        } catch (error) {
          console.error('Wallet connection failed:', error);
          set({
            isConnected: false,
            isConnecting: false,
            address: null,
            publicKey: null,
            connectionError: {
              type: 'connection_failed',
              message: error instanceof Error ? error.message : 'Connection failed',
            },
          });
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
          connectionError: null,
        });
      },

      checkConnection: () => {
        // Check if we have a stored connection
        if (stacksIsConnected()) {
          const stored = getLocalStorage();
          if (stored?.addresses?.stx?.[0]) {
            const stxAddr = stored.addresses.stx[0];
            
            // Validate network matches
            const expectedNetwork = NETWORK_MODE;
            const detectedNetwork = detectNetworkFromAddress(stxAddr.address);

            if (!validateNetworkMatch(stxAddr.address, expectedNetwork)) {
              // Network mismatch - disconnect stored session
              stacksDisconnect();
              set({
                isConnected: false,
                address: null,
                publicKey: null,
                connectionError: {
                  type: 'network_mismatch',
                  detectedNetwork,
                  expectedNetwork,
                },
              });
              return;
            }

            set({
              isConnected: true,
              address: stxAddr.address,
              publicKey: (stxAddr as { publicKey?: string }).publicKey || null,
              connectionError: null,
            });
            // Refresh balances
            get().fetchBalances();
            get().fetchPrices();
          }
        }
      },

      clearError: () => {
        set({ connectionError: null });
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

      fetchPrices: async () => {
        const { btcUsd, stxUsd } = await fetchLivePrices();
        const updates: Partial<WalletState> = {};
        if (btcUsd !== null) updates.btcPriceUsd = btcUsd;
        if (stxUsd !== null) updates.stxPriceUsd = stxUsd;
        if (btcUsd !== null || stxUsd !== null) {
          updates.priceLastUpdated = Date.now();
        }
        set(updates);
      },

      setNetwork: (network) => set({ network }),
    }),
    {
      name: 'sbtc-pay-wallet',
      partialize: (state) => ({
        // Only persist non-sensitive data
        network: state.network,
        btcPriceUsd: state.btcPriceUsd,
        stxPriceUsd: state.stxPriceUsd,
        priceLastUpdated: state.priceLastUpdated,
      }),
    }
  )
);

// ── Price polling ───────────────────────────────────────────────────
let _priceInterval: ReturnType<typeof setInterval> | null = null;

/** Start polling Coinbase/CoinGecko every 60 s. Safe to call multiple times. */
export function startPricePolling() {
  if (_priceInterval) return;
  // Fetch immediately on init
  useWalletStore.getState().fetchPrices();
  _priceInterval = setInterval(() => {
    useWalletStore.getState().fetchPrices();
  }, 60_000);
}

export function stopPricePolling() {
  if (_priceInterval) {
    clearInterval(_priceInterval);
    _priceInterval = null;
  }
}

// ── Utility hooks ──────────────────────────────────────────────────

/** Live BTC price in USD (updates every 60 s). */
export function useBtcPrice(): number {
  return useWalletStore((s) => s.btcPriceUsd);
}

/** Live STX price in USD (updates every 60 s). */
export function useStxPrice(): number {
  return useWalletStore((s) => s.stxPriceUsd);
}

/** Both live prices as a tuple — for passing to amountToUsd(). */
export function useLivePrices(): { btcPriceUsd: number; stxPriceUsd: number } {
  const btcPriceUsd = useWalletStore((s) => s.btcPriceUsd);
  const stxPriceUsd = useWalletStore((s) => s.stxPriceUsd);
  return { btcPriceUsd, stxPriceUsd };
}

/**
 * Returns true when the cached price is older than 5 minutes (or never fetched).
 * Use this to show a "prices may be outdated" indicator.
 */
export function usePriceStale(): boolean {
  const lastUpdated = useWalletStore((s) => s.priceLastUpdated);
  if (lastUpdated === null) return true;
  return Date.now() - lastUpdated > PRICE_STALE_MS;
}

/**
 * Returns a function that converts sats → USD string using the live price.
 * Usage: `const satsToUsd = useSatsToUsd(); satsToUsd(50000)` → "48.75"
 */
export function useSatsToUsd(): (sats: number) => string {
  const btcPriceUsd = useWalletStore((s) => s.btcPriceUsd);
  return (sats: number) => ((sats / 100_000_000) * btcPriceUsd).toFixed(2);
}

export function useFormattedStxBalance(): string {
  const stxBalance = useWalletStore((s) => s.stxBalance);
  const stx = Number(stxBalance) / 1_000_000;
  return stx.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

export function useFormattedSbtcBalance(): string {
  const sbtcBalance = useWalletStore((s) => s.sbtcBalance);
  return (Number(sbtcBalance) / 100_000_000).toFixed(8);
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
