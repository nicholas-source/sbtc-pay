import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { NETWORK_MODE, API_URL, SBTC_CONTRACT_ID } from '@/lib/stacks/config';
import { amountToUsd as amountToUsdFn } from '@/lib/constants';
import { authenticateWallet, hasValidAuth, clearWalletAuth } from '@/lib/supabase/client';

// Lazy-load @stacks/connect so the 1 MB WalletConnect SDK isn't in the initial bundle.
// The module is cached after first import, so subsequent calls are instant.
const loadStacksConnect = () => import('@stacks/connect');

// ── Synchronous session restore from @stacks/connect's localStorage ────────
// This lets us hydrate wallet state instantly on page load without importing
// the 1 MB library. Key: "@stacks/connect" (set by the library itself).
function getPersistedSession(): { address: string; publicKey: string | null } | null {
  try {
    const raw = localStorage.getItem('@stacks/connect');
    if (!raw) return null;
    const data = JSON.parse(raw);
    const stxEntry = data?.addresses?.stx?.[0];
    if (!stxEntry?.address) return null;
    return { address: stxEntry.address, publicKey: stxEntry.publicKey ?? null };
  } catch {
    return null;
  }
}

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
  connectionChecked: boolean;
  provider: WalletProvider;
  address: string | null;
  publicKey: string | null;
  network: Network;
  connectionError: WalletError;
  /** Whether the wallet has a valid JWT for authenticated Supabase calls. */
  isAuthenticated: boolean;

  // Balances (in base units: microSTX and sats)
  stxBalance: bigint;
  sbtcBalance: bigint;
  balancesLoading: boolean;
  btcPriceUsd: number | null;
  stxPriceUsd: number | null;
  priceLastUpdated: number | null; // epoch ms of last successful live fetch

  // Actions
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  checkConnection: () => Promise<void>;
  /** Authenticate with Supabase via wallet signature (sign-once, 24h JWT). */
  authenticate: () => Promise<void>;
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

// Hydrate wallet state synchronously from @stacks/connect localStorage
const _restored = getPersistedSession();
const _restoredAddress = _restored?.address ?? null;
const _restoredConnected = !!_restoredAddress;

export const useWalletStore = create<WalletState>()(
  persist(
    (set, get) => ({
      isConnected: _restoredConnected,
      isConnecting: false,
      connectionChecked: _restoredConnected, // if we have a session, skip the loading spinner
      provider: null,
      address: _restoredAddress,
      publicKey: _restored?.publicKey ?? null,
      network: NETWORK_MODE,
      connectionError: null,
      isAuthenticated: _restoredAddress ? hasValidAuth(_restoredAddress) : false,
      stxBalance: BigInt(0),
      sbtcBalance: BigInt(0),
      balancesLoading: false,
      btcPriceUsd: null,
      stxPriceUsd: null,
      priceLastUpdated: null,

      connect: async () => {
        set({ isConnecting: true, connectionError: null });
        try {
          const { connect: stacksConnect } = await loadStacksConnect();
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
                const { disconnect: stacksDisconnect } = await loadStacksConnect();
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

              // balancesLoading flips to true here (not later in fetchBalances) so
              // payment widgets gate the Pay button through the entire authenticate
              // → fetch chain. Without this, there's a window where isConnected=true
              // but balance is still its initial 0n, and clicking Pay reads zero
              // and shows a spurious "insufficient funds" toast.
              set({
                isConnected: true,
                isConnecting: false,
                address: stxAddress,
                publicKey,
                connectionError: null,
                balancesLoading: true,
              });

              try {
                // Authenticate with Supabase (sign-once → 24h JWT)
                // If we already have a valid JWT, this is instant (no popup).
                await get().authenticate();
                // Fetch balances after connecting (awaited so UI has real data)
                await get().fetchBalances();
              } finally {
                // Defensive: if authenticate or fetchBalances throws,
                // make sure the UI doesn't get stuck on "Loading balance…"
                if (get().balancesLoading) set({ balancesLoading: false });
              }
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

      disconnect: async () => {
        const { disconnect: stacksDisconnect } = await loadStacksConnect();
        stacksDisconnect();
        clearWalletAuth();
        set({
          isConnected: false,
          isConnecting: false,
          isAuthenticated: false,
          provider: null,
          address: null,
          publicKey: null,
          stxBalance: BigInt(0),
          sbtcBalance: BigInt(0),
          balancesLoading: false,
          connectionError: null,
        });
      },

      checkConnection: async () => {
        try {
          const { isConnected: stacksIsConnected, getLocalStorage, disconnect: stacksDisconnect } = await loadStacksConnect();

          if (stacksIsConnected()) {
            const stored = getLocalStorage();
            if (stored?.addresses?.stx?.[0]) {
              const stxAddr = stored.addresses.stx[0];

              // Validate network matches
              const expectedNetwork = NETWORK_MODE;
              const detectedNetwork = detectNetworkFromAddress(stxAddr.address);

              if (!validateNetworkMatch(stxAddr.address, expectedNetwork)) {
                stacksDisconnect();
                set({
                  isConnected: false,
                  connectionChecked: true,
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

              // Merge with any persisted publicKey (localStorage strips it,
              // but we persist it in zustand)
              const persistedPublicKey = get().publicKey;

              set({
                isConnected: true,
                connectionChecked: true,
                address: stxAddr.address,
                publicKey: (stxAddr as { publicKey?: string }).publicKey || persistedPublicKey || null,
                isAuthenticated: hasValidAuth(stxAddr.address),
                connectionError: null,
              });

              // Fetch balances and prices in parallel (non-blocking)
              get().fetchBalances();
              get().fetchPrices();
              return;
            }
          }

          // @stacks/connect says not connected — clear persisted state too
          set({
            connectionChecked: true,
            isConnected: false,
            address: null,
            publicKey: null,
          });
        } catch (error) {
          console.error('checkConnection failed:', error);
          // On error, keep persisted state but mark check as done
          // so the UI doesn't hang on the spinner forever
          set({ connectionChecked: true });
        }
      },

      clearError: () => {
        set({ connectionError: null });
      },

      authenticate: async () => {
        const { address } = get();
        if (!address) return;

        // Already authenticated — skip (no popup)
        if (hasValidAuth(address)) {
          set({ isAuthenticated: true });
          return;
        }

        try {
          const { request } = await loadStacksConnect();
          await authenticateWallet(address, async (message: string) => {
            const result = await request('stx_signMessage', { message });
            return { signature: result.signature };
          });
          set({ isAuthenticated: true });
        } catch (err) {
          console.warn("[wallet-auth] Authentication failed:", err);
          // Don't block the user — they can still browse, but writes will fail.
          // isAuthenticated stays false; UI can show a "sign in" prompt if needed.
          set({ isAuthenticated: false });
        }
      },

      fetchBalances: async () => {
        const { address } = get();
        if (!address) return;

        set({ balancesLoading: true });

        // Retry up to 3 times with exponential backoff
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const response = await fetch(
              `${API_URL}/extended/v1/address/${address}/balances`
            );
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();

            // Extract STX balance (in microSTX)
            const stxBalance = BigInt(data.stx?.balance || '0');

            // Extract sBTC balance
            const sbtcKey = `${SBTC_CONTRACT_ID}::sbtc-token`;
            const sbtcBalance = BigInt(
              data.fungible_tokens?.[sbtcKey]?.balance || '0'
            );

            set({ stxBalance, sbtcBalance, balancesLoading: false });
            return; // Success — exit retry loop
          } catch (error) {
            if (attempt < 2) {
              // Wait 1s, then 3s before retrying
              await new Promise(r => setTimeout(r, (attempt + 1) * 1500));
            } else {
              console.error('Failed to fetch balances after 3 attempts:', error);
              set({ balancesLoading: false });
            }
          }
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

/** Live BTC price in USD (updates every 60 s). null = not yet fetched. */
export function useBtcPrice(): number | null {
  return useWalletStore((s) => s.btcPriceUsd);
}

/** Live STX price in USD (updates every 60 s). null = not yet fetched. */
export function useStxPrice(): number | null {
  return useWalletStore((s) => s.stxPriceUsd);
}

/** Both live prices — for passing to amountToUsd(). null = not yet fetched. */
export function useLivePrices(): { btcPriceUsd: number | null; stxPriceUsd: number | null } {
  const btcPriceUsd = useWalletStore((s) => s.btcPriceUsd);
  const stxPriceUsd = useWalletStore((s) => s.stxPriceUsd);
  return { btcPriceUsd, stxPriceUsd };
}

/**
 * Convenience hook: returns an amountToUsd function pre-bound to live prices.
 * Usage: `const toUsd = useAmountToUsd(); toUsd(50000, 'sbtc')` → "$48.75" or "—"
 */
export function useAmountToUsd() {
  const { btcPriceUsd, stxPriceUsd } = useLivePrices();
  return (amount: number, tokenType: import('@/lib/stacks/config').TokenType) =>
    amountToUsdFn(amount, tokenType, btcPriceUsd, stxPriceUsd);
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
 * Returns "—" if price hasn't loaded yet.
 */
export function useSatsToUsd(): (sats: number) => string {
  const btcPriceUsd = useWalletStore((s) => s.btcPriceUsd);
  return (sats: number) => {
    if (btcPriceUsd === null) return '—';
    return ((sats / 100_000_000) * btcPriceUsd).toFixed(2);
  };
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
  if (btcPriceUsd === null) return '—';
  const btc = Number(sbtcBalance) / 100_000_000;
  return (btc * btcPriceUsd).toFixed(2);
}
